var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
require('babel-polyfill');
import { Telemetry } from "ibt-telemetry";
import { map, from, ReplaySubject, filter, distinct, count, lastValueFrom, groupBy, reduce, toArray, mergeAll } from "rxjs";
function toPoint(sample) {
    return {
        lap: sample.getParam("Lap").value,
        gpsLatitude: sample.getParam("Lat").value,
        gpsLongitude: sample.getParam("Lon").value,
        trackPositionPct: sample.getParam("LapDistPct").value,
        onTrack: sample.getParam("IsOnTrackCar").value == 1
    };
}
function generateFromFile(ibtFile, resolution, normalize = false) {
    return __awaiter(this, void 0, void 0, function* () {
        // read points from file
        // group points based on resolution
        // average coordinates together
        // sort by trackPositionPct
        // write to output
        const t = yield Telemetry.fromFile(ibtFile);
        const samples = t.samples();
        const samples$ = from(samples);
        //samples$.pipe(map(sample => sample.toJSON())).subscribe(console.log);
        const pointsSource$ = samples$.pipe(map(toPoint), filter(point => point.onTrack));
        const points$ = new ReplaySubject();
        pointsSource$.subscribe(points$);
        //points$.subscribe(console.log);
        // group points based on resolution
        const trackMap = points$.pipe(groupBy((point) => (point.trackPositionPct * resolution) | 0))
            // average each group of points into a single point
            .pipe(map(pointGroup$ => {
            return pointGroup$.pipe(reduce((acc, point) => ({
                count: acc.count + 1,
                lat: acc.lat + point.gpsLatitude,
                lon: acc.lon + point.gpsLongitude
            }), {
                count: 0,
                lat: 0,
                lon: 0,
            }), map(avgPoint => ({
                trackPositionPct: pointGroup$.key / resolution,
                lat: avgPoint.lat / avgPoint.count,
                lon: avgPoint.lon / avgPoint.count,
                samples: avgPoint.count
            })));
        }), mergeAll())
            // sort results by track position pct and output
            .pipe(toArray(), map(pointArray => {
            const points = [...pointArray];
            points.sort((a, b) => a.trackPositionPct - b.trackPositionPct);
            return points;
        }));
        const totalLaps = yield lastValueFrom(points$.pipe(map(point => point.lap), distinct(), count()));
        const trackArray = yield lastValueFrom(trackMap);
        if (normalize) {
            // normalize map scale to 0-1
            let minLat = Infinity;
            let maxLat = -Infinity;
            let minLon = Infinity;
            let maxLon = -Infinity;
            for (const trackPoint of trackArray) {
                minLat = Math.min(minLat, trackPoint.lat);
                minLon = Math.min(minLon, trackPoint.lon);
                maxLat = Math.max(maxLat, trackPoint.lat);
                maxLon = Math.max(maxLon, trackPoint.lon);
            }
            const latRange = maxLat - minLat;
            const lonRange = maxLon - minLon;
            const latCenter = (minLat + maxLat) / 2;
            const lonCenter = (minLon + maxLon) / 2;
            const scale = Math.max(latRange, lonRange);
            // move every point to the center, then adjust by the scale, then offset by (0.5, 0.5)
            const normalizedTrackArray = trackArray.map(point => ({
                samples: point.samples,
                trackPositionPct: point.trackPositionPct,
                lat: ((point.lat - latCenter) / scale) + 0.5,
                lon: ((point.lon - lonCenter) / scale) + 0.5
            }));
            return {
                map: normalizedTrackArray,
                totalLaps
            };
        }
        else {
            return {
                map: trackArray,
                totalLaps,
            };
        }
    });
}
const telemetryFile = "C:/Users/zm/Documents/iRacing/telemetry/dallarap217_watkinsglen 2021 fullcourse 2022-06-17 20-13-00.ibt";
generateFromFile(telemetryFile, 250).then(console.log);
