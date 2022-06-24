
require('babel-polyfill');
import { Telemetry } from "ibt-telemetry";
import { map, tap, from, filter, distinct, count, lastValueFrom, groupBy, reduce, toArray, pipe, mergeAll, generate, Subject, Observable } from "rxjs";

import getPath from 'platform-folders';
import * as fs from 'node:fs/promises';
import { Stats } from "node:fs";

type Point = {
    lap: number,
    trackPositionPct: number,
    gpsLatitude: number,
    gpsLongitude: number,
    onTrack: boolean,
}

type AggPoint = {
    samples: number,
    lat: number,
    lon: number,
    trackPositionPct: number,
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
            return pointGroup$.pipe(reduce((acc: AggPoint, point: Point) => ({
                samples: acc.samples + 1,
                lat: acc.lat + point.gpsLatitude,
                lon: acc.lon + point.gpsLongitude,
                trackPositionPct: acc.trackPositionPct + point.trackPositionPct,
            }) as AggPoint, {
                samples: 0,
                lat: 0,
                lon: 0,
                trackPositionPct: 0,
            }),
                map(avgPoint => ({
                    trackPositionPct: avgPoint.trackPositionPct / avgPoint.samples,
                    lat: avgPoint.lat / avgPoint.samples,
                    lon: avgPoint.lon / avgPoint.samples,
                    samples: avgPoint.samples
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

/**
 * Parses the most recently modified telemetry file in the user's default telemetry folder and returns a track map if possible.  May return null if no telemetry files can be found.
 * 
 * @param resolution the number of map points to generate. Higher resolution indicates a more detailed map
 * @returns the processed track map
 */
export async function getCurrentTrackMap(resolution = 100): Promise<TrackMap> {
    const currentTelemFile = await findLastTelemetryFile();
    if (!currentTelemFile) throw new Error("No telemetry files found");

    return await generateFromFile(currentTelemFile, resolution);
}


type TrackPoint = {
    trackId: number,
    lat: number,
    lon: number,
    trackPositionPct: number,
}

function getSamplesFromFile(ibtFilePath: string): Observable<TrackPoint> {
    
    const ibtFile = from(Telemetry.fromFile(ibtFilePath));
   const points = ibtFile.pipe(
        tap(_ => console.log("opened file: " + ibtFilePath)),
        filter(t => !!((t as any).sessionInfo)),
        map(t => {
            const trackId = (t as any).sessionInfo.WeekendInfo.TrackID as number;
            return from(t.samples()).pipe(
                filter(sample => (sample.getParam("IsOnTrackCar")?.value) == 1),
                                map(sample => ({
                    lat: sample.getParam("Lat")!.value as number,
                    lon: sample.getParam("Lon")!.value as number,
                    trackPositionPct: sample.getParam("LapDistPct")!.value as number,
                    trackId
                } as TrackPoint))
            );
        }),
        mergeAll()
    );

    return points;
}

function scanDirectoryForPoints(telemetryDirPath: string = telemPath): Observable<TrackPoint> {
   return from(fs.readdir(telemetryDirPath))
        .pipe(
            tap(_ => console.debug("opened directory: " + telemetryDirPath)),
            map(files => from(files)), mergeAll(),
            filter(path => path.toLowerCase().endsWith('.ibt')),
            map(file => getSamplesFromFile(telemetryDirPath + "\\" + file)),
            mergeAll()
        );
}

/** Scans the given directory for telemetry files and produces track maps combined from the data from each file */
export function getTrackMaps(telemetryDirPath: string = telemPath, resolution = 200): Observable<TrackMap> {
    const points$ = scanDirectoryForPoints(telemetryDirPath);

    return points$.pipe(
        groupBy(point => point.trackId),
        // scale up points by resolution
        map(trackPoints$ => {
            const trackId = trackPoints$.key;

            return trackPoints$.pipe(
                // group points by resolution
                groupBy(point => ((point.trackPositionPct * resolution) |0)),
                map(pointGroup$ => {
                    // average nearby points together
                    return pointGroup$.pipe(
                        // add all nearby points together for a running sum
                        reduce((acc, point) => ({
                            samples: acc.samples+1,
                            trackPositionPct: acc.trackPositionPct + point.trackPositionPct,
                            lat: acc.lat + point.lat,
                            lon: acc.lon + point.lon,
                        }), {
                            samples: 0,
                            trackPositionPct: 0,
                            lat: 0,
                            lon: 0
                        }),
                        // avoid division by zero if the resolution is too high (this should never actually occur)
                        filter(aggPoint => aggPoint.samples != 0),
                        // divide by the number of samples to get a single average point
                        map(aggPoint => ({
                            samples: aggPoint.samples,
                            trackPositionPct: aggPoint.trackPositionPct + (0.5/resolution),
                            lat: aggPoint.lat / aggPoint.samples,
                            lon: aggPoint.lon / aggPoint.samples
                        }))
                    )
                }),
                // merge point groups together and combine into an array for sorting
                mergeAll(), toArray(),
                // sort track points and create track map
                map(trackPoints => {
                    const sortedTrackPoints = [...trackPoints];
                    sortedTrackPoints.sort((p1,p2) => p1.trackPositionPct - p2.trackPositionPct);
                    
                    // TODO normalize track points

    
                    const trackMap: TrackMap = {
                        trackId,
                        totalLaps: 0, // hard to tell when there are multiple files
                        map: getNormalizedPoints(sortedTrackPoints)
                    }

                    return trackMap;
                }),
            )
        }),
        mergeAll()
    );
}

async function getTrackMapsPromise(telemetryDirPath: string = telemPath, resolution = 200) : Promise<TrackMap[]> {
    return lastValueFrom(getTrackMaps(telemetryDirPath, resolution).pipe(toArray()));
}

function getNormalizedPoints(points: AggPoint[]) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;

    for (const trackPoint of points) {
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

    const normalizedTrackArray = points.map(point => ({
        samples: point.samples,
        trackPositionPct: point.trackPositionPct,
        lat: point.lat,
        lon: point.lon,
        y: ((point.lat - latCenter) / scale) + 0.5,
        x: ((point.lon - lonCenter) / scale) + 0.5
    }));

    return normalizedTrackArray;
}
