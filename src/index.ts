
require('babel-polyfill');
import { Telemetry } from "ibt-telemetry";
import { map, take, from, ReplaySubject, filter, distinct, count, lastValueFrom, groupBy, reduce, toArray, pipe, mergeAll, generate, Subject } from "rxjs";

import getPath from 'platform-folders';
import * as fs from 'node:fs/promises';
import { Stats } from "node:fs";

import * as YAML from 'yaml';

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


    // apparently dthe telemetry definitions are innacurate, so define what we need
    const t = (await Telemetry.fromFile(ibtFilePath));
    const sessionInfo = (t as any).sessionInfo as {
        WeekendInfo: {
            SessionID: number,
            SubSessionID: number,
            TrackConfigName: string,
            TrackDisplayName: string,
            TrackDisplayShortName: string,
            TrackID: number,
            TrackName: string,
            TrackNorthOffset: string, // e.g., "3.4218 rad"
        }
    };

    console.log("TrackName: ", sessionInfo.WeekendInfo.TrackName);
    console.log("TrackID: ", sessionInfo.WeekendInfo.TrackID);

    const samples$ = from(t.samples() as Iterable<Sample>);

    const sampleSubject$ = new Subject<Sample>();


    // sampleSubject$.subscribe(sample => console.log(sample.toJSON()));

    const points$ = sampleSubject$.pipe(map(toPoint), filter(point => point.onTrack));

    //points$.subscribe(console.log);

    // group points based on resolution

    const trackMap$ = points$.pipe(groupBy((point) => (point.trackPositionPct * resolution) | 0))
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



    const totalLaps$ = points$.pipe(map(point => point.lap), distinct(), count());

    const sampleSubscription = samples$.subscribe(sampleSubject$);

    const totalLaps = await lastValueFrom(totalLaps$);
    const trackArray = await lastValueFrom(trackMap$);

    sampleSubscription.unsubscribe();

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
        lat: point.lat,
        lon: point.lon,
        y: ((point.lat - latCenter) / scale) + 0.5,
        x: ((point.lon - lonCenter) / scale) + 0.5
    }));



    return {
        trackId: sessionInfo.WeekendInfo.TrackID,
        map: normalizedTrackArray,
        totalLaps,
    }
}

export type TrackMap = Awaited<ReturnType<typeof generateFromFile>>;

const telemPath = getPath('documents') + "\\iRacing\\telemetry";

export async function findLastTelemetryFile(): Promise<string | undefined> {
    const telemDir = await fs.readdir(telemPath);

    type FileStats = {
        path: string,
        stats: Stats
    }

    let candidate = null as (FileStats | null);

    for (const telemFile of telemDir) {
        const path = telemPath + "\\" + telemFile;
        if (!telemFile.toLowerCase().endsWith(".ibt")) continue;
        const stats = await fs.stat(path);
        if (candidate == null || candidate.stats.mtimeMs < stats.mtimeMs) {
            candidate = {
                path,
                stats,
            };
        }
    }

    return candidate?.path;
}

export async function getCurrentTrackMap(minLaps = 2, resolution = 100, normalize = true): Promise<TrackMap | null> {
    const currentTelemFile = await findLastTelemetryFile();
    if (!currentTelemFile) return null;

    const trackMap = await generateFromFile(currentTelemFile, resolution, normalize);

    if (trackMap.totalLaps < minLaps) return null;
    else return trackMap;
}