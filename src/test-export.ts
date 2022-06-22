import * as fs from 'fs';
import * as TrackMap from './index';

// const telemetryFile = "C:/Users/zm/Documents/iRacing/telemetry/dallarap217_watkinsglen 2021 fullcourse 2022-06-17 20-13-00.ibt"

// generateFromFile(telemetryFile, 500, true).then((map) => {
//     fs.writeFile("./map-out.json", JSON.stringify(map), console.error);

//     let minLat = Infinity;
//     let maxLat = -Infinity;
//     let minLon = Infinity;
//     let maxLon = -Infinity;

//     for(const point of map.map) {
//         minLat = Math.min(point.lat, minLat);
//         minLon = Math.min(point.lon, minLon);
//         maxLat = Math.max(point.lat, maxLat);
//         maxLon = Math.max(point.lon, maxLon);
//     }

//     console.log({
//         minLat, maxLat, minLon, maxLon
//     });
// });
TrackMap.getCurrentTrackMap(5, 500, false).then(map => fs.writeFile("./map-out.json", JSON.stringify(map), console.error));