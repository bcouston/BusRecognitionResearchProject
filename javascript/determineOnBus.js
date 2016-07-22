/* This file determines whether a user has travelled on a bus and what stops they
  * entered and exited at, based on the previously computed classified location data
  * from syncLocationActivityData.js */

var mysql = require('mysql');

var busStopsJson = require('../sheffield_bus_stops.json');
var classifiedLocActs = require('./syncLocationActivityData');

// Activity Types
const WALKING_TYPE = 7;
const VEHICLE_TYPE = 0;
const STILL_TYPE = 3;

// Radius of bounding circle around bus stop location (in metres)
const MAX_DISTANCE_FROM_BUS_STOP = 100;

/** computeBusRoutesTravelled() Calculate the bus routes the user has likely travelled
  * based on their past locations and the activities they were doing at those locations.
  * @param {Array[LocationsWithActivityTypes]} locations - Array of locations with their
  * respective activity types.
  * @param {MySQLConnection} connection_mm - Current connection to the database.
  * @return {Array{busRoute}} busRoutes - The bus routes the user has likely travelled,
  * including entry and exit bus stops, and at what time they travelled the route.
  */
function computeBusRoutesTravelled(locations, connection_mm) {
  var busRoutes = [];
  for (var i = 1; i < locations.length; i++) {
    // If it is clear the the user has entered into a vehicle...
    if (hasEnteredVehicle(locations, i)) {
        var locX = locations[i - 1].latitude;
        var locY = locations[i - 1].longitude;
        // Loop through all known bus stops in area (currently only Sheffield)
        for (bs = 0; bs < busStopsJson.features.length; bs++) {
          var busStopX = busStopsJson.features[bs].geometry.coordinates[1];
          var busStopY = busStopsJson.features[bs].geometry.coordinates[0];
          var busStopName = busStopsJson.features[bs].properties.name;
          if (typeof(busStopName) == "undefined") {busStopName = "Unknown";}
          // Check if the bus stop is was within a constan distance of the user
          if (classifiedLocActs.computeDistance(locX, busStopX, locY, busStopY) < MAX_DISTANCE_FROM_BUS_STOP) {
            console.log('POSSIBLE BUS STOP ENTRY');
            var possibleBusEntry = [busStopX, busStopY];
            // If near bus stop, mark as posible bus route entry point and calculate
            // if user got off vehicle near a bus stop
            var busExit = computeBusExit(i, locations, busStopX, busStopY, connection_mm);
            var locTimestamp = new Date(locations[i].timestamp);
            // If user ceased vehicle activity near another bus stop, user has most likely
            // taken a bus - add bus route to bus routes array
            if (busExit.busStopX != null) {
              if (busExit.busStopX != "no_bus_stop_exit") {
                busRoutes.push({busEntry: [busStopX, busStopY], busExit: [busExit.busStopX, busExit.busStopY],
                  busStopNames: [busStopName, busExit.busStopName], timestamps: [locTimestamp, busExit.timestamp]});
              }
              i = busExit.locationIndex;
              break;
            }
          }
        }
    }
  }
  return busRoutes;
}

/** computeBusExit() Calculate if a user has gotten off a suspected bus near a bus stop.
  * @param {Integer} locationIndex - Index of the suspected bus stop entrance in
  * the locations array. Used as a starting point to calculate a possible bus route
  * exit from.
  * @param {Array[LocationsWithActivityTypes]} locations - Array of locations with their
  * respective activity types.
  * @param {Double} entrybusStopX - X coordinate of suspected bus stop that the user entered on.
  * @param {Double} entrybusStopY - Y coordinate of suspected bus stop that the user entered on.
  * @param {MySQLConnection} connection_mm - Current connection to the database.
  * @return {Object} - Data regarding a suspected bus route exit point. Fields set to
  * null if no bus stop was found.
  */
function computeBusExit(locationIndex, locations, entrybusStopX, entrybusStopY, connection_mm) {
  for (var i = locationIndex + 1; i < locations.length; i++) {
    // Calculate if user is likely to have left a vahicle at a location
    if (hasLeftVehicle(locations, i, connection_mm)) {
      // Compute average location between location that user has suspected to have left a vehicle
      // and the previous location.
      var centreCoordinates = computeCentreCoordinates(
        {latitude: locations[i].latitude, longitude: locations[i].longitude},
        {latitude: locations[i - 1].latitude, longitude: locations[i - 1].longitude});
      var locCX = centreCoordinates.latitude;
      var locCY = centreCoordinates.longitude;
      var locX = locations[i].latitude;
      var locY = locations[i].longitude;
      for (bs = 0; bs < busStopsJson.features.length; bs++) {
        var busStopX = busStopsJson.features[bs].geometry.coordinates[1];
        var busStopY = busStopsJson.features[bs].geometry.coordinates[0];
        var busStopName = busStopsJson.features[bs].properties.name;
        if (typeof(busStopName) == "undefined") {busStopName = "Unknown";}
        // If user location is within constant distance radius of bus stop, where
        // user location is either the exact location of when a non-vehicle activity
        // first occured or the average coordinate location of that and the previous
        // location as any activity could have occured in that interval...
        if (((classifiedLocActs.computeDistance(locCX, busStopX, locCY, busStopY) < MAX_DISTANCE_FROM_BUS_STOP) ||
          (classifiedLocActs.computeDistance(locX, busStopX, locY, busStopY) < MAX_DISTANCE_FROM_BUS_STOP)) &&
          ((entrybusStopX != busStopX) && (entrybusStopY != busStopY))) {
          console.log("POSSIBLE BUS STOP EXIT")
          // Return possible bus route exit
          return {busStopX: busStopX, busStopY: busStopY, busStopName: busStopName, timestamp: new Date(locations[i].timestamp), locationIndex: i};
        }
      }
      // No bus route exit found
      return {busStopX: "no_bus_stop_exit", busStopY: null, busStopName: null, locationIndex: i};
    }
  }
  // No bus route exit found
  return {busStopX: "no_bus_stop_exit", busStopY: null, busStopName: null, locationIndex: i};
}

/** hasEnteredVehicle() Determines if a user has likely entered a vehicle.
* @param {Array[LocationsWithActivityTypes]} locations - Array of locations with their
* respective activity types.
* @param {Integer} locationIndex - Index of the suspected bus stop entrance in
* the locations array.
* @return {Boolean} - Whether user may have entered a vehicle.
*/
function hasEnteredVehicle(locations, index) {
  // If current location has a vehicle activity type and previous location does not,
  // return true for possible vehicle entry
  if (locations[index].activity == VEHICLE_TYPE) {
    if (locations[index-1].activity != VEHICLE_TYPE) {
      return true;
    }
  }
  return false;
}

/** computeCentreCoordinates() Calculate the average/centre coordinate location of
  * 2 locations.
  * @param {Latitude, Longitude} loc1 - Location 1.
  * @param {Latitude, Longitude} loc1 - Location 2.
  * @return {Latitude, Longitude} loc1 - Centre coordinate location.
  */
function computeCentreCoordinates(loc1, loc2) {
  return [(loc1.latitude + loc2.latitude) / 2, (loc1.longitude + loc2.longitude) / 2]
}

/** hasLeftVehicle() Determines if user has likely left a vehicle, based on whether
  * enough time has elapsed since a vehicle activity or enough steps have been registered.
  * @param {Array[LocationsWithActivityTypes]} locations - Array of locations with their
  * respective activity types.
  * @param {Integer} locationIndex - Index of the suspected bus stop entrance in
  * the locations array.
  * @param {MySQLConnection} connection_mm - Current connection to the database.
  * @return {Boolean} - Whether user may have exited a vehicle.
  */
function hasLeftVehicle(locations, index, connection_mm) {
  // Constant that denotes the time needed to have passed without a vehicle
  // activity for a vehicle exit to be registered
  const TIME_ELAPSED_FOR_VEHICLE_EXIT = 3 * 60000; // 3 minutes
  var timeSinceVehicleActivity = 0;
  var vehicleLeaveTime = null;
  var nextVehicleActTime = "3000-01-01 00:00:01";
  // Suspected vehicle exit
  if (locations[index].activity != VEHICLE_TYPE) {
    // Sourced from http://stackoverflow.com/questions/5129624/convert-js-date-time-to-mysql-datetime,
    // defines suspected time when user exited from a vehicle
    vehicleLeaveTime = new Date(locations[index - 1].timestamp).toISOString().slice(0, 19).replace('T', ' ');
    for (var a = index; a < locations.length; a++) {
      if (timeSinceVehicleActivity > TIME_ELAPSED_FOR_VEHICLE_EXIT) {
        return true;
      }
      // For every location after suspected vehicle exit, add difference in timestamps
      // to running time since vehicle activity
      timeSinceVehicleActivity += locations[a].timestamp - locations[index - 1].timestamp;
      // If a location with a vehicle activity has been found, resort to counting
      // steps taken since suspected vehicle exit
      if (locations[a].activity == VEHICLE_TYPE) {
        nextVehicleActTime =  new Date(locations[a].timestamp).toISOString().slice(0, 19).replace('T', ' ');
        return getStepsSinceLeftVehicle(vehicleLeaveTime, nextVehicleActTime, connection_mm);
      }
    }
  }
  return false;
}

/** getStepsSinceLeftVehicle() Retrieve the steps taken by the user from the DB,
  * since the timestamp of the suspected vehicle exit location and return if larger
  * than a constant.
  * @param {MySQLDate} vehicleLeaveTime - The date and time of the suspected vehicle
  * exit occurence.
  * @param {MySQLDate} nextVehicleActTime - The date and time of the next location with a vehicle
  * activity.
  * @param {MySQLConnection} connection_mm - Current connection to the database.
  * @return {Boolean} - Whether the number of steps elapsed indicates that the user
  * has left the vehicle.
  */
function getStepsSinceLeftVehicle(vehicleLeaveTime, nextVehicleActTime, connection_mm) {
  // Number of steps needed to have passed until user can be said to have left vehicle
  const STEPS_UNTIL_LEFT_VEHICLE = 50;
  // Get steps since suspected vehicle exit
  connection_mm.query('SELECT * FROM steps ' +
    'WHERE userID = ' + '\"' + classifiedLocActs.userID + '\"' + " AND timestamp > " + "\"" + vehicleLeaveTime + "\"" +
    " AND timestamp < " +  "\"" + nextVehicleActTime + "\"" + " ORDER BY timestamp ASC;", function(err, steps, fields) {
    if (err) {
      throw err;
    } else {
      var noOfStepsSinceVehicle = 0;
      // Add steps to running steps counter and return true if over the constant
      for (var s = 0; s < steps.length; s++) {
        if (noOfStepsSinceVehicle > STEPS_UNTIL_LEFT_VEHICLE) {
          return true;
        }
        noOfStepsSinceVehicle += steps[s].numberOfSteps;
      }
      return false;
    }
  });
  return false;
}

module.exports = ({

  computeBusRoutesTravelled: computeBusRoutesTravelled

})
