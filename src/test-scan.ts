import { getTrackMaps } from "./index";

getTrackMaps().subscribe(map => {

    let totalSamples = 0;
    for(const point of map.map) {
        totalSamples += point.samples;
    }

    console.log(`ID: ${map.trackId}, Samples ${totalSamples}`);
})