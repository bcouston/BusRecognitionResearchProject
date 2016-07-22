/* Purpose of this file is to segment and remove erroneous activities as well as
  remove erroneous locations from those retrieved from the database.
*/

// Constants

const SAMPLING_RATE_IN_MSECS = 45 * 1000; // Phone sampling rate (taken from Movemore app)
const MAX_ALLOWED_INTERVAL_BETWEEN_ACTS_STILL = 60000 * 10; // 10 minutes
const MAX_ALLOWED_INTERVAL_BETWEEN_ACTS_MOVING = 60000 * 1.5; // 1 minute 30 seconds

// Activity type values
const VEHICLE_TYPE = 0;
const BICYCLE_TYPE = 1;
const ON_FOOT_TYPE = 2;
const STILL_TYPE = 3;
const UNKNOWN_TYPE = 4;
const TILTING_TYPE = 5;
const WALKING_TYPE = 7;
const RUNNING_TYPE = 8;

//

/** removeErroneousActivities() Removes activities that are considered erroneous
  * and thus are removed to not intefere with the location classification.
  * @param {Array[Activity]} acts - Activities to remove if erroneous.
  * @return {Array[Activity]} activities - Updated activities array with erroneous
  * activities removed.
  */
function removeErroneousActivities(acts) {
  var activities = acts;
  // Executed backwards to not mess up the indexing
  for (var i = activities.length - 1; i >= 0; i--) {
    var activity = activities[i];
    // If essential fields of activity are null, remove
    if ((activity.formatted_start_time == null) || (activity.formatted_end_time == null) || (activity.activity_type == null) || (activity.activity_id == null)) {
      activities.splice(i, 1);
  // If times are clearly erroneous, remove
  } else if ((activity.formatted_end_time.getTime() < (60000 * 10)) || (activity.formatted_start_time.getTime() > activity.formatted_end_time.getTime())) {
      activities.splice(i, 1);
    }
  }
  return activities;
}

/** removeErroneousLocations() Removes locations that are considered erroneous.
  * @param {Array[Location]} locs - Locations to remove if erroneous.
  * @return {Array[Location]} locations - Updated locations array with erroneous
  * locations removed.
  */
function removeErroneousLocations(locs) {
  var locations = locs;
  // Executed backwards to not mess up the indexing
  for (var i = locations.length - 1; i >= 0; i--) {
    var location = locations[i];
    // If essential fields of location are null, or coordinates are both 0, remove
    if ((location.formatted_timestamp == null) || (location.longitude == null) || (location.longitude == 0) || (location.latitude == null) || (location.latitude == 0)) {
      locations.splice(i, 1);
    }
  }
  return locations;
}

/** estimateStartDate() Estimates the start date time of an activity if it is
  * set to a UNIX timestamp of 0. Currently this is an issue when activities
  * are added to the db.
  * @param {Array[Activity]} activities - Activites to analyze.
  * @param {Integer} index - Index of the specific activity in activities to analyze.
  */
function estimateStartDate(activities, index) {
  var act = activities[index];
  // If start time of activity is less than 10 minutes after 01/01/1970 00:00:00 (could be set way higher)
  if (act.formatted_start_time.getTime() < (60000 * 10)) {
    // If first activity or duration between current and previous activity end times is more than 10 mins,
    // set start time to end time subtract multiple of sampling rate
    if (index == 0) {
      act.formatted_start_time = new Date(act.formatted_end_time.getTime() - (SAMPLING_RATE_IN_MSECS * 2));
    } else if ((isStillActivity(act) && (getDuration(act.formatted_end_time.getTime(), activities[index - 1].formatted_end_time.getTime())
      > MAX_ALLOWED_INTERVAL_BETWEEN_ACTS_STILL)) || (isMovingActivity(act) &&
      (getDuration(act.formatted_end_time.getTime(), activities[index - 1].formatted_end_time.getTime())
      > MAX_ALLOWED_INTERVAL_BETWEEN_ACTS_MOVING))) {
      act.formatted_start_time = new Date(act.formatted_end_time - (SAMPLING_RATE_IN_MSECS * 2));
    // Else set start time to be a second after previous activity's end time
    } else {
      act.formatted_start_time = new Date(activities[index - 1].formatted_end_time.getTime() + 1000);
    }
  }
}

/** isMovingActivity() Determine if an activity that invloves movement.
  * @param {Activity} act - Activity record.
  * @return {Boolean} - Whether activity is a moving activity.
  */
function isMovingActivity(act) {
  return (act.activity_type == RUNNING_TYPE || act.activity_type == WALKING_TYPE ||
    act.activity_type == VEHICLE_TYPE || act.activity_type == BICYCLE_TYPE ||
    act.activity_type == ON_FOOT_TYPE);
}

/** isStillActivity() Determine if an activity is a still activity.
  * @param {Activity} act - Activity record.
  * @return {Boolean} - Whether activity is a still activity.
  */
function isStillActivity(act) {
  return (act.activity_type == STILL_TYPE);
}

/** joinAdjacentActivities() Joins activity records into segments if activity types
  * are identical to adjacent actvities
  * @param {Array[Activity]} activities - Activities to segment.
  * @return {Array[ActivitySegments]} activitySegments - Segmented activities.
  */
function joinAdjacentActivities(activities) {
  console.log("Segmenting...")
  var activitySegments = []
  var activitySegment = null;
  var segmentStart = true;
  var lastSegment = false;
  for (var a = 0; a < activities.length; a++) {
    var activity = activities[a];
    if (a != (activities.length - 1)) {
      // If segment not started, start segment.
      if (segmentStart) {
        activitySegment = activity;
        segmentStart = false;
      }
      // If activity type of next activity and current activity segment is identical,
      // add to segment
      if (activities[a + 1].activity_type == activitySegment.activity_type) {
        activitySegment.formatted_end_time = activities[a + 1].formatted_end_time;
        if ((a + 1) == (activities.length - 1)) {
          lastSegment = true;
        }
      // ELse, segment is finished
      } else {
        activitySegments.push(activitySegment);
        segmentStart = true;
      }
    // Push last activity to its own segment if not already in one
    } else if (!lastSegment) {
      activitySegments.push(activities[a]);
    }
  }
  return activitySegments;
}

/** normaliseTiltingActivity() Removes tilting activities by changing them to
  * the same type of the closest activity that isn't a tilting activity.
  * @param {Array[Activity]} activities - Activites to analyze.
  * @param {Integer} index - Index of the specific activity in activities to analyze.
  */
function normaliseTiltingActivity(activities, index) {
  var activity = activities[index];
  // If tilting, make activity type same as closest activity
  if (activity.activity_type == TILTING_TYPE) {
    activity.activity_type = findClosestNonTiltingActivity(activities, index)
  }
}

/** findClosestNonTiltingActivity() Determine activity type of closest activity
  * to given activity that is not a tilting activity.
  * @param {Array[Activity]} activities - Activites to analyze.
  * @param {Integer} index - Index of the specific activity in activities to analyze.
  * @return {Integer} - Activity type of closest non-tilting activity.
  */
function findClosestNonTiltingActivity(activities, index) {
  var inBounds = false;
  var a = 1;
  while (true) {
    inBounds = false;
    if ((index - a) > 0) {
      inBounds = true;
      if (activities[index - a].activity_type != TILTING_TYPE) {
        return activities[index - a].activity_type;
      }
    }
    if ((index + a) < activities.length) {
      inBounds = true;
      if (activities[index + a].activity_type != TILTING_TYPE) {
        return activities[index + a].activity_type;
      }
    }
    if (!inBounds) {
      console.log("Not in bounds of activities, check findClosestNonTiltingActivity().")
      throw new Error();
    }
    a++;
  }
}

/** getDuration() Calculate duration in milliseconds between two given date times.
  * @param {UNIX timestamp} endTime - Largest date time in milliseconds.
  * @param {UNIX timestamp} startTime - Smallest date time in milliseconds.
  * @return {Long} - Time difference in milliseconds.
  */
function getDuration(endTime, startTime) {
  return endTime - startTime;
}

module.exports = ({

  estimateStartDate: estimateStartDate,
  normaliseTiltingActivity: normaliseTiltingActivity,
  joinAdjacentActivities: joinAdjacentActivities,
  removeErroneousActivities: removeErroneousActivities,
  removeErroneousLocations: removeErroneousLocations

});
