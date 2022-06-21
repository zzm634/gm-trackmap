
require('babel-polyfill');
import { Telemetry } from "ibt-telemetry";
import { map, take, from, ReplaySubject, filter, distinct, count, lastValueFrom, groupBy, reduce, toArray, pipe, mergeAll } from "rxjs";

type Point = {
    lap: number,
    trackPositionPct: number,
    gpsLatitude: number,
    gpsLongitude: number,
    onTrack: boolean,
}

type AveragedPoint = {
    count: number,
    lat: number,
    lon: number
}

type Sample = {
    toJSON: () => string,
    getParam: (_: string) => {
        name: string,
        description: string,
        value: number | string
        unit: string,
    }
}

function toPoint(sample: Sample): Point {
    return {
        lap: sample.getParam("Lap").value as number,
        gpsLatitude: sample.getParam("Lat").value as number,
        gpsLongitude: sample.getParam("Lon").value as number,
        trackPositionPct: sample.getParam("LapDistPct").value as number,
        onTrack: (sample.getParam("IsOnTrackCar").value as number) == 1
    }
}

/**
 * Parses the given ibt file and 
 * 
 * @param ibtFilePath the path to the iRacing .ibt file containing telemetry data
 * @param resolution the number of points used to define the track map. More resolution = more detailed map
 * @param normalize whether the points should be scaled and normalized to be between 0.0 and 1.0
 */
export async function generateFromFile(ibtFilePath: string, resolution: number, normalize = false) {
    // read points from file
    // group points based on resolution
    // average coordinates together
    // sort by trackPositionPct
    // write to output

    const t = await Telemetry.fromFile(ibtFilePath);

    const samples = t.samples() as Iterable<Sample>;

    const samples$ = from(samples);

    //samples$.pipe(map(sample => sample.toJSON())).subscribe(console.log);

    const pointsSource$ = samples$.pipe(map(toPoint), filter(point => point.onTrack));

    const points$ = new ReplaySubject<Point>();
    pointsSource$.subscribe(points$);

    //points$.subscribe(console.log);

    // group points based on resolution

    const trackMap = points$.pipe(groupBy((point) => (point.trackPositionPct * resolution) | 0))
        // average each group of points into a single point
        .pipe(map(pointGroup$ => {
            return pointGroup$.pipe(reduce((acc: AveragedPoint, point: Point) => ({
                count: acc.count + 1,
                lat: acc.lat + point.gpsLatitude,
                lon: acc.lon + point.gpsLongitude
            }) as AveragedPoint, {
                count: 0,
                lat: 0,
                lon: 0,
            }),
                map(avgPoint => ({
                    trackPositionPct: pointGroup$.key / resolution,
                    lat: avgPoint.lat / avgPoint.count,
                    lon: avgPoint.lon / avgPoint.count,
                    samples: avgPoint.count
                })));
        }), mergeAll())
        // sort results by track position pct and output
        .pipe(toArray(),
            map(pointArray => {
                const points = [...pointArray];
                points.sort((a, b) => a.trackPositionPct - b.trackPositionPct);
                return points;
            }));


    const totalLaps = await lastValueFrom(points$.pipe(map(point => point.lap), distinct(), count()));
    const trackArray = await lastValueFrom(trackMap);

    points$.unsubscribe();

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
        }
    }
}

import * as fs from 'fs';

const telemetryFile = "C:/Users/zm/Documents/iRacing/telemetry/dallarap217_watkinsglen 2021 fullcourse 2022-06-17 20-13-00.ibt"

generateFromFile(telemetryFile, 500, true).then((map) => {
    fs.writeFile("./map-out.json", JSON.stringify(map), console.error);
});