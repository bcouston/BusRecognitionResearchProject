/* This file classifies locations into activity groups retrieved from the database
  based on a userID. This file should be run first.
*/

var correctActivities = require("./correctActivities")
var onBus = require("./determineOnBus");

// Create MySQL DB connection

var mysql = require('mysql');

// Create MySQL DB connection
var connection_mm = mysql.createConnection({
  host     : process.env.DB_HOST_MM,
  user     : process.env.DB_USER_MM,
  password : process.env.DB_PASS_MM,
  database : process.env.DB_DB_MM
});

connection_mm.connect();

// Create SQLite Connection - now deprecated, kept for posterity
// var sqlite3 = require('sqlite3').verbose();

// Ignore this, was for retrieving from local db, now deprecated
// var db = new sqlite3.Database('C:/Users/Ben/workspace/SegmentationJava/sqlite/ben_segments.db');
// var table = "segments_ben_14_07"

// Some search terms for SQL queries
var userID = process.env.DB_USER_ID;
var startDateTime = "\"" + "2016-07-19 12:00:01" + "\"";
var endDateTime = "\"" + "2016-07-22 14:00:01" + "\"";

// Activity type values
const STILL_TYPE = 3;
const TILITING_TYPE = 5;
const UNKNOWN_TYPE = 4;
const WALKING_TYPE = 7;
const RUNNING_TYPE = 8;
const VEHICLE_TYPE = 0;
const BICYCLE_TYPE = 1;

// Statistics counters
var count_loc = 0;
var count_act = 0;
var firstMatch = 0;
var secondMatch = 0;
var thirdMatch = 0;
var fourthMatch = 0;
var still = 0;
var walk = 0;
var run = 0;
var vehicle = 0;
var unknown = 0;
var stillSeg = 0;
var walkSeg = 0;
var tiltingSeg = 0;
var runSeg = 0;
var vehicleSeg = 0;
var unknownSeg = 0;
var still1 = 0;
var walk1 = 0;
var tilting1 = 0;
var run1 = 0;
var vehicle1 = 0;
var unknown1 = 0;

// Deprecated - use in case of recieving activities that have activity
// confidences rather than defined activity types
// function computeLongestActivityType(segment) {
//   var activityTypes = [segment.vehicle, 0, 0, segment.still, segment.notknown,
//     segment.tilting, 0, segment.walking, segment.running];
//   segment.activity_type = indexOfMax(activityTypes);
// }

// Deprecated - Sourced from http://stackoverflow.com/questions/11301438/return-index-of-greatest-value-in-an-array
// function indexOfMax(arr) {
//   if (arr.length === 0) {
//       return -1;
//   }
//   var max = arr[0];
//   var maxIndex = 0;
//   for (var i = 1; i < arr.length; i++) {
//     if (arr[i] > max) {
//         maxIndex = i;
//         max = arr[i];
//     }
//   }
//   return maxIndex;
// }

// SQL Date to Javascript Date conversion functions

/** addFormattedTimes() - Add a Javascript Date fields for startDate and endDate.
  * @param {Array[Activity]} activities - Array of activity records.
  * @param {Integer} index - Index of activity record to alter in activities array.
  */
function addFormattedTimes(activities, index) {
  var activity = activities[index];
  activity.formatted_start_time = new Date(activity.startDate);
  activity.formatted_end_time = new Date(activity.endDate);
}

/** addFormattedTimes() - Add a Javascript Date field for timestamp.
  * @param {Location} location - location to alter.
  */
function addFormattedTimestamp(location) {
  location.formatted_timestamp = new Date(location.timestamp);
}

// ----- MAIN FUNCTIONALITY ----- //

classifyLocationsIntoActivities();

/** classifyLocationsIntoActivities() - Classify all locations into activities based on
  * query parameters from the database.
  */
function classifyLocationsIntoActivities() {
  // Retrieve individual activity records
  connection_mm.query('SELECT *, activityID AS activity_id, type AS activity_type FROM activities ' +
    'WHERE userID = ' + '\"' + userID + '\"' + " AND endDate > " + startDateTime +
		" AND endDate < " + endDateTime + ' ORDER BY endDate ASC;', function(err1, activities, fields) {
    // Deprecated - retrieving from local db, kept for posterity
    // db.all('SELECT *, segmentId AS activity_id FROM ' + table +
    //     ' ORDER BY startTime ASC;', function(err1, activities){
    //       console.log(activities.length);
    // Retrieve locations
    if (err1) {return err1;} else {
      // Prepare activities for location classification
      for (var a = 0; a < activities.length; a++) {
        // Add uniform DateTime fields for startDate and endDate
        addFormattedTimes(activities, a);
        // Compute an estimate of the start date if is equivalent to UNIX Timestamp 0
        correctActivities.estimateStartDate(activities, a);
        // Change tilting activites to next most likely activity
        correctActivities.normaliseTiltingActivity(activities, a);
      }
      // Remove activities that are still erroneous
      activities = correctActivities.removeErroneousActivities(activities);
      console.log("Activity Records: " + activities.length)
      // Join individual activity records into activity segments if identical activity types
      activities = correctActivities.joinAdjacentActivities(activities);
      console.log("Activity Segments: " + activities.length)
      // Compute the occurences of all activity types in the segments
      computeActivityTypeOccurences(activities);
      // Retrieve individual location records
      connection_mm.query('SELECT * FROM locations WHERE userID = ' + '\"' + userID +
        '\"' + " AND timestamp > " + startDateTime + " AND timestamp < " + endDateTime +
        ' ORDER BY timestamp ASC;', function(err2, locations, fields) {
        if (err2) {return err2;} else {
          // Add formatted timestamp field with javascript Date data type
          for (var l = 0; l < locations.length; l++) {
            var location = locations[l];
            addFormattedTimestamp(location);
          }
          // Remove erroneous locations
          locations = correctActivities.removeErroneousLocations(locations);
          // Classify locations into activities
          var locationToActivityMap = [];
          for (var l = 0; l < locations.length; l++) {
            count_loc++;
            var activity = computeClosestActivity(locations, l, activities);
            addToLocationToActivityMap(locations[l], activity, locationToActivityMap);
          }
          // Display results of classification
          //displayClassificationResults(locationToActivityMap);
          // Display statistics of classification
          displayClassificationStats();
          var data = convertToJSONForVisualisation(locationToActivityMap);
          //console.log(data);
          // Compute bus routes travelled by the user.
          var busRoutes = onBus.computeBusRoutesTravelled(data, connection_mm);
          connection_mm.end();
          console.log(busRoutes);
          // Print coordinates out for visual mapping
          console.log("Coordinates for visual mapping: ");
          for (var r = 0; r < busRoutes.length; r++) {
            console.log(busRoutes[r].busStopNames);
            console.log(busRoutes[r].busEntry[0] + ", " + busRoutes[r].busEntry[1]);
            console.log(busRoutes[r].busExit[0] + ", " + busRoutes[r].busExit[1]);
          }
        }
      });
    }
  });
  // Deprecated - db.close();
}

/** displayClassificationResults() - Display locations with in the activities they belong to.
  * @param {Array[locationsInActivity]} classifiedLocActs - Array of activties that each contain an array of classified locations.
  */
function displayClassificationResults(classifiedLocActs) {
  locationToActivityMap.forEach(function(map) {
    console.log('Activity Start Time: ')
    console.log(map.activity.formatted_start_time);
    console.log('Activity End Time: ')
    console.log(map.activity.formatted_end_time);
    console.log('Locations: ');
    console.log(map.locations.length);
    console.log('----------')
  });
}

/** displayClassificationStats() - Display statistics of location to activity classification
  * after execution.
  */
function displayClassificationStats() {
  console.log("Stats: ");
  console.log("Total Locations: ");
  console.log(count_loc);
  console.log("Total Activities (May be lower than actual no): ")
  console.log(count_act);
  console.log("Activity Segments Activity Types Count: ")
  console.log("   Still: " + stillSeg);
  console.log("   Walking: " + walkSeg);
  console.log("   Running: " + runSeg);
  console.log("   Vehicle: " + vehicleSeg);
  console.log("   Tilting: " + tiltingSeg);
  console.log("   Unknown: " + unknownSeg);
  console.log("Location Activity Types Count: ")
  console.log("   Still: " + still1);
  console.log("   Walking: " + walk1);
  console.log("   Running: " + run1);
  console.log("   Vehicle: " + vehicle1);
  console.log("   Tilting: " + tilting1);
  console.log("   Unknown: " + unknown1);
  console.log("In Bounds matches: ")
  console.log(firstMatch/count_loc);
  console.log("Adj Activity Rel Location Speed matches: ")
  console.log(secondMatch/count_loc);
  var totalActTypes = still + walk + run + vehicle + unknown;
  console.log("   Still: " + still/totalActTypes);
  console.log("   Walking: " + walk/totalActTypes);
  console.log("   Running: " + run/totalActTypes);
  console.log("   Vehicle: " + vehicle/totalActTypes);
  console.log("   Unknown: " + unknown/totalActTypes);
  console.log("Adj Activity Nearest Activity matches: ")
  console.log(thirdMatch/count_loc);
  console.log("Other: ");
  console.log(fourthMatch/count_loc);
}

/** computeActivityTypeOccurences() Calculate a total of the different activity types
  * of the segments.
  * @param {Array[ActivitySegment]} activities - Array of activity segments.
  */
function computeActivityTypeOccurences(activities) {
  for (var a = 0; a < activities.length; a++) {
    switch (activities[a].activity_type) {
      case STILL_TYPE:
        stillSeg++;
        break;
      case WALKING_TYPE:
        walkSeg++;
        break;
      case TILITING_TYPE:
        tiltingSeg++;
        break;
      case RUNNING_TYPE:
        runSeg++;
        break;
      case VEHICLE_TYPE:
        vehicleSeg++;
        break;
      case UNKNOWN_TYPE:
        unknownSeg++;
        break;
    }
  }
}

/** computeClosestActivity() - Calculate the activity that a location likely falls
  * into.
  * @param {Array[Location]} locations - Array of locations.
  * @param {Integer} locationIndex - Index of location to analyse.
  * @param {Array[ActivitySegment]} activities - Array of activity segments as classification groups.
  * @return {ActivitySegment} closestActivity - ActivitySegment that was likely occuring when
  * location was recorded.
  */
function computeClosestActivity(locations, locationIndex, activities) {
  // Default closest activity is first activity
  var closestActivity = activities[0];
  var location = locations[locationIndex];
  // First, calculate if location timestamp falls within startDate and endDate of activity
  var inActivityBounds = computeIfInActivityBounds(location, activities);
  if (inActivityBounds[0] != null) {
    closestActivity = inActivityBounds[0];
    firstMatch++;
  } else {
    closestActivity = classIntoAdjacentActivity(locations, locationIndex, activities);
  }
  // Add to statistics counters
  if (closestActivity.activity_type == STILL_TYPE) {
    still1++;
  } else if (closestActivity.activity_type == WALKING_TYPE) {
    walk1++;
  } else if (closestActivity.activity_type == TILITING_TYPE) {
    tilting1++;
  } else if (closestActivity.activity_type == RUNNING_TYPE) {
    run1++;
  } else if (closestActivity.activity_type == VEHICLE_TYPE) {
    vehicle1++;
  } else if (closestActivity.activity_type == UNKNOWN_TYPE) {
    unknown1++;
  }
  return closestActivity;
}

/** computeIfInActivityBounds() Calculate if a location falls within the startDate and endDate of an activity
  * @param {Location} location - Location to analyse.
  * @param {Array[ActivitySegment]} activities - Activities to check Date/Tiem boundaries for.
  * @return {ActivitySegment} closestActivity - ActivitySegment that was likely occuring when
  * location was recorded.
  */
function computeIfInActivityBounds(location, activities) {
  var closestActivity = [null, 1000000000000];
  for (i = 0; i < activities.length; i++) {
    activity = activities[i];
    // Check If location timestamp is within activity startDate/endDate boundaries,
    // if so, return that activity.
    if (activity.formatted_start_time <= location.formatted_timestamp) {
      if (activity.formatted_end_time >= location.formatted_timestamp) {
        var differenceFromActivityStart = computeTimeDifference(activity.formatted_start_time, location.formatted_timestamp);
        if (differenceFromActivityStart < closestActivity[1]) {
          closestActivity = [activity, differenceFromActivityStart];
        }
      }
    } else {return closestActivity;}
  }
  return closestActivity;
}

//--DEPRECATED--//

/** computeMidTimeFrame() Convert activity times to Javascript Date and calculate midpoint
  * @param {ActivitySegment} activity - Activity segment
  */
// function computeMidTimeFrame(activity) {
//   startTime = activity.formatted_start_time;
//   endTime = activity.formatted_end_time;
//   return (midTimeFrame(startTime,endTime));
// }

/** classIntoAdjacentActivity() Attempt to classify location into one of the closest two surrounding
  * activities if the lcoation does not fall exactly within the bounds of an activity.
  * @param {Array[Location]} locations - Array of locations.
  * @param {Integer} locationIndex - Index of location to analyse.
  * @param {Array[ActivitySegment]} activities - Array of activity segments as classification groups.
  * @return {ActivitySegment} closestActivity - ActivitySegment that was likely occuring when
  * location was recorded.
  */
function classIntoAdjacentActivity(locations, locationIndex, activities) {
  const MAX_ALLOWED_INTERVAL = 60;
  for (var a = 0; a < activities.length; a++) {
    if (a != (activities.length - 1)) {
      // If timestamp of location is before the first activity's startDate, then
      // classify into first activity.
      if (locations[locationIndex].formatted_timestamp < activities[0].formatted_start_time) {
        var closestActivity = activities[0];
        thirdMatch++;
        return closestActivity;
      } else {
        // Else if location is between two adjacent locations...
        if ((activities[a].formatted_end_time <=
          locations[locationIndex].formatted_timestamp) &&
          (activities[a+1].formatted_start_time  >=
          locations[locationIndex].formatted_timestamp)) {
          // If activity types of bothe activities are not identical...
          if (activities[a].activity_type != activities[a+1].activity_type) {
            // If interval betwwen actvities does not exceed the MAX_ALLOWED_INTERVAL in minutes...
            if (isIntervalBetweenActitivitiesBelowThreshold(activities[a],
              activities[a+1], MAX_ALLOWED_INTERVAL)) {
              // Calculate likely type of activity that occured when location was recorded
              var likelyLocationActivityType = computeLikelyLocationActivityType(locations, locationIndex);
              // Classify location into one of the surronding activities that has the same type
              if (likelyLocationActivityType == activities[a].activity_type) {
                var closestActivity = activities[a];
                secondMatch++;
                return closestActivity;
              } else if (likelyLocationActivityType == activities[a+1].activity_type) {
                var closestActivity = activities[a+1];
                secondMatch++;
                return closestActivity;
              }
            }
          }
          // Else, classify the location into the nearest activity based on the timestamp
          var closestActivity = classIntoNearestActivity(
            locations[locationIndex].formatted_timestamp,
            activities[a], activities[a+1]);
          thirdMatch++;
          return closestActivity;
        }
      }
    // Else, classify into the last activity
    } else {
      fourthMatch++;
      var closestActivity = activities[a];
      return closestActivity;
    }
  }
}

/** isIntervalBetweenActitivitiesBelowThreshold() Calculate if interval between
  * two adjacent activities is less than the constant threshold in minutes.
  * @param {ActivitySegment} activity1 - Earlist activity.
  * @param {ActivitySegment} activity2 - Latest activity.
  * @param {Integer} threshold - Interval threshold in minutes.
  * @return {Boolean} - Whether interval is below threshold.
  */
function isIntervalBetweenActitivitiesBelowThreshold(activity1, activity2, threshold) {
  return ((activity2.formatted_start_time.getTime() -
    activity1.formatted_start_time.getTime()) < (threshold * 60000));
}

/** computeLikelyLocationActivityType() Calculate the likely activity type that
  * was occuring when the location was recorded based on the computed speed travelled
  * from the recorded location before that.
  * @param {Array[Location]} locations - Array of locations.
  * @param {Integer} locationIndex - Index of location to analyse.
  * @return {Integer} likelyLocationActivityType - Likely activity type that was
  * occurring at the time of the location recording.
  */
function computeLikelyLocationActivityType(locations, locationIndex) {
  if (locationIndex != 0) {
    var currentLocation = locations[locationIndex];
    var previousLocation = locations[locationIndex - 1];
    // If current location is not identical to previous location
    if (currentLocation.formatted_timestamp.getTime() !=
        previousLocation.formatted_timestamp.getTime()) {
        // Compute distance travelled between locations based on coordinates
        var distance = computeDistance(currentLocation.latitude, previousLocation.latitude,
          currentLocation.longitude, previousLocation.longitude);
        // Compute speed travelled at based on calculated distance and timestamps.
        var speed = computeSpeed(distance*1000, currentLocation.formatted_timestamp,
          previousLocation.formatted_timestamp);
        // Determine likely location activity type
        if (movingAtZeroSpeed(speed)) {
          var likelyLocationActivityType = STILL_TYPE; //CREATE TYPES
          still++;
          return likelyLocationActivityType;
        } else if (movingAtWalkingSpeed(speed)) {
          var likelyLocationActivityType = WALKING_TYPE;
          walk++;
          return likelyLocationActivityType;
        } else if (movingAtRunningSpeed(speed)) {
          var likelyLocationActivityType = RUNNING_TYPE;
          run++;
          return likelyLocationActivityType;
        } else if (movingAtVehicleSpeed(speed)) {
          vehicle++;
          var likelyLocationActivityType = VEHICLE_TYPE;
          return likelyLocationActivityType;
        }
    }
  }
  return null;
}

/** computeTimeDifference() Calculate time difference between two Dates.
  * @param {Date} startTime - Start Date.
  * @param {Date} endTime - End Date.
  * @return {Milliseconds} - Time difference in Milliseconds.
  */
function computeTimeDifference(startTime, endTime) {
  return Math.abs(endTime.getTime() - startTime.getTime());
}

/** classIntoNearestActivity() Classify location into nearest activity based on time values.
  * @param {Location} location - Location to classify.
  * @param {ActivitySegment} activity1 - Activivty before location timestamp.
  * @param {ActivitySegment} activity2 - Activivty after location timestamp.
  * @return {ActivitySegment} closestActivity - ActivitySegment that was likely occuring when
  * location was recorded.
  */
function classIntoNearestActivity(location, activity1, activity2) {
  if (Math.abs(location - activity1.formatted_end_time) <
    Math.abs(location - activity2.formatted_start_time)) {
    var closestActivity = activity1;
    return closestActivity;
  } else {
    var closestActivity = activity2;
    return closestActivity;
  }
  return null;
}

// Sourced from Movemore Android app

/** computeDistance() Calculate the distance in metres between two coordinates.
  * @param {Double} lat1 - Latitude of 1st coordinate.
  * @param {Double} lat2 - Latitude of 2nd coordinate.
  * @param {Double} lon1 - Longitude of 1st coordinate.
  * @param {Double} lon2 - Longitude of 2nd coordinate.
  * @return {Double} - Distance in metres between two coordinates.
  */
function computeDistance(lat1, lat2, lon1, lon2) {
  // invalid coordinates: do not do anything
  if (((lat1 == 0) && (lon1 == 0)) || ((lat2 == 0) && (lon2 == 0))) {
    return 0.0;
  }
  const R = 6371; // Radius of the earth
  var latDistance = toRadians(lat2 - lat1);
  var lonDistance = toRadians(lon2 - lon1);
  var a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2))
    * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  var distance = R * c * 1000; // convert to meters
  distance = Math.pow(distance, 2);
  return Math.sqrt(distance);
}

/* Self-explanatory functions */

// Sourced from http://cwestblog.com/2012/11/12/javascript-degree-and-radian-conversion/

function toRadians(degrees) {
  return degrees * Math.PI / 180;
}

function computeSpeed(distance, startTime, endTime) {
  return (distance / (startTime.getTime() - endTime.getTime()));
}

function movingAtZeroSpeed(speed) {
  return (speed <= 1);
}

function movingAtWalkingSpeed(speed) {
  // we make some allowance because the gps may not kick in immediately and because people may be running
  return ((speed > 1) && (speed < 3));
}

function movingAtRunningSpeed(speed) {
  // we make some allowance because the gps may not kick in immediately and because people may be running
  return ((speed > 2) && (speed < 6.5));
}

function movingAtVehicleSpeed(speed) {
  // we make some allowance because the gps may not kick in immediately and because people may be running
  return (speed >= 6.5);
}

/** addToLocationToActivityMap() Add location to activity class/group.
  * @param {Location} location - Location to add to activty class/group.
  * @param {ActivitySegment} activity - Activity for location to be classified into.
  * @param {Array[locationstoActivity]} locationToActivityMap - Array of activities w/
  * classified locations.
  */
function addToLocationToActivityMap(location, activity, locationToActivityMap) {
  // If activity does not already exist, create new activity entry with location
  if (activityExists(location, activity, locationToActivityMap) == false) {
    locationToActivity = {activity: activity, locations: [location]};
    locationToActivityMap.push(locationToActivity);
    count_act++;
  }
}

/** activityExists() Check if activity exists in activity w/ classified locations array.
* @param {Location} location - Location to add to activty class/group.
* @param {ActivitySegment} activity - Activity for location to be classified into.
* @param {Array[locationstoActivity]} locationToActivityMap - Array of activities w/
* classified locations.
* @return {Boolean} - Whether activity already exists in array.
*/
function activityExists(location, activity, locationToActivityMap) {
  for (var i = 0; i <  locationToActivityMap.length; i++) {
    var map = locationToActivityMap[i];
    // If activity already exists, add location to exisiting activity
    if (map.activity.activity_id === activity.activity_id) {
      map.locations.push(location);
      return true;
    }
  }
  return false;
}

// ----- CONVERSION TO JSON -----

/** convertToJSONForVisualisation() Convert location to activity mapping array to
  JSON structure as a list of locations with an added activity field.
  * @param {Array[locationstoActivity]} locationToActivityMap - Array of activities w/
  * classified locations.
  * @return {Array[ClassifiedLocations]} locationsJSON - Array of classified locations
  * w/ extra activity field.
  */
function convertToJSONForVisualisation(locationToActivityMap) {
  var locationsJSON = [];
  for (var i = 0; i < locationToActivityMap.length; i++) {
    var map = locationToActivityMap[i];
    for (var l = 0; l < map.locations.length; l++) {
      var location = map.locations[l];
      // Create new VisualiseLocation object and add to JSON array
      var visLoc = new VisualiseLocation(location, map.activity.activity_type);
      locationsJSON.push({"timestamp": visLoc.timestamp,
                          "latitude": visLoc.latitude,
                          "longitude": visLoc.longitude,
                          "accuracy": visLoc.accuracy,
                          "activity": visLoc.activity});
    }
  }
  return locationsJSON;
}

/** VisualiseLocation() Custom class for a location JSON Object.
  * @param {Location} location - location to convert to JSON Object.
  * @param {Integer} activityType - Activity type occuring at location.
  */
function VisualiseLocation(location, activityType) {
  this.timestamp = location.formatted_timestamp.getTime();
  this.latitude = location.latitude;
  this.longitude = location.longitude;
  this.accuracy = computeGeolocationAccuracy(location.latitude, location.longitude);
  this.activity = activityType;
}

/** computeGeolocationAccuracy() Calculate how accurate a location is based on
  * the number of decimal places of the coordinates.
  * @param {Double} latitude - Latitude coordinate of location.
  * @param {Double} longitude - Longitude coordinate of location.
  * @return {Double} - Accuracy in metres.
  */
function computeGeolocationAccuracy(latitude, longitude) {
  var noOfDps = 0;
  if (decimalPlaces(latitude) < decimalPlaces(longitude)) {
    noOfDps = decimalPlaces(latitude);
  } else {noOfDps = decimalPlaces(longitude);}
  return (100000 / Math.pow(10,noOfDps));
}

/** decimalPlaces() Output number of decimal places in coordinate.
  * @param {Double} coordinate - Coordinate to analyse (e.g. 53.584)
  * @return {Integer} - Number of decimal places in coordinate.
  */
function decimalPlaces(coordinate) {
  if (coordinate) {
    return (coordinate.toString().split(".")[1].length);
  }
}

//  DEPRECATED

/** midTimeFrame() Calculate the midpoint of the timeframe of an activity
  * @param {MySQLDate} startTime - Start time of activity retrieved from MySQL table
  * @param {MySQLDate} endTime - End time of activity retrieved from MySQL table
  */
// function midTimeFrame(startTime,endTime) {
//   return (new Date((startTime.getTime() + endTime.getTime()) / 2));
// }

/** convertToDate() Convert MySQL date to Javascript Date
  * @param {MySQLDate} mySqlDate - Date retrieved from MySQL table
  */
// function convertToDate(mySqlDate) {
//   var date = null;
//   try {date = new Date(mySqlDate);}
//   catch(err) {return null;}
//   return date;
// }

module.exports.computeDistance = computeDistance;
module.exports.userID = userID;
