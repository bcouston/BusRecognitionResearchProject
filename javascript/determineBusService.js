/* NOTE: As of 22/07/2016 a publicly accessible API for retirieving bus service database
  for Sheffield could not be found. Nevertheless, here is a rough framework for retrieving
  bus service data from a future dataset and determing what bus services a user might regularly use.
*/

var busServiceData = null; //require(../bus_service_data.json)

/** computeBusServices() Determines what bus services the user has travelled
  * based on the previous bus routes they have taken.
  * @param {Array[busRoute]} busRoutes - Previous bus routes the user has taken.
  * @return {Array[busService]} busServices - Computed bus services the user has taken.
  */
function computeBusServices(busRoutes) {
  var busServices = [];
  for (var r = 0; r < busRoutes.length; r++) {
    var busRoute = busRoutes[r];
    for (var svc = 0; svc < busServiceData.results.length; svc++) {
      var busService = busServiceData.results[svc];
      var busStopMatches = 0;
      for (var s = 0; s < busService.busStops.length; s++) {
        var busStop = busService.busStops[s];
        // Entry bus stop
        if (busRoute.busStopNames[0] == busStop.name) {
          busStopMatches++;
        // Exit bus stop
        } else if (busRoute.busStopNames[1]== busStop.name) {
          busStopMatches++;
        }
        if (busStopMatches == 2) {
          busServices.push(busService);
        }
      }
    }
  }
  return busServices;
}
