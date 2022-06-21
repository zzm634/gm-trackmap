"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
require('babel-polyfill');
var ibt_telemetry_1 = require("ibt-telemetry");
var rxjs_1 = require("rxjs");
function toPoint(sample) {
    return {
        lap: sample.getParam("Lap").value,
        gpsLatitude: sample.getParam("Lat").value,
        gpsLongitude: sample.getParam("Lon").value,
        trackPositionPct: sample.getParam("LapDistPct").value,
        onTrack: sample.getParam("IsOnTrackCar").value == 1
    };
}
function generateFromFile(ibtFile, resolution, normalize) {
    if (normalize === void 0) { normalize = false; }
    return __awaiter(this, void 0, void 0, function () {
        var t, samples, samples$, pointsSource$, points$, trackMap, totalLaps, trackArray, minLat, maxLat, minLon, maxLon, _i, trackArray_1, trackPoint, latRange, lonRange, latCenter_1, lonCenter_1, scale_1, normalizedTrackArray;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, ibt_telemetry_1.Telemetry.fromFile(ibtFile)];
                case 1:
                    t = _a.sent();
                    samples = t.samples();
                    samples$ = (0, rxjs_1.from)(samples);
                    pointsSource$ = samples$.pipe((0, rxjs_1.map)(toPoint), (0, rxjs_1.filter)(function (point) { return point.onTrack; }));
                    points$ = new rxjs_1.ReplaySubject();
                    pointsSource$.subscribe(points$);
                    trackMap = points$.pipe((0, rxjs_1.groupBy)(function (point) { return (point.trackPositionPct * resolution) | 0; }))
                        // average each group of points into a single point
                        .pipe((0, rxjs_1.map)(function (pointGroup$) {
                        return pointGroup$.pipe((0, rxjs_1.reduce)(function (acc, point) { return ({
                            count: acc.count + 1,
                            lat: acc.lat + point.gpsLatitude,
                            lon: acc.lon + point.gpsLongitude
                        }); }, {
                            count: 0,
                            lat: 0,
                            lon: 0,
                        }), (0, rxjs_1.map)(function (avgPoint) { return ({
                            trackPositionPct: pointGroup$.key / resolution,
                            lat: avgPoint.lat / avgPoint.count,
                            lon: avgPoint.lon / avgPoint.count,
                            samples: avgPoint.count
                        }); }));
                    }), (0, rxjs_1.mergeAll)())
                        // sort results by track position pct and output
                        .pipe((0, rxjs_1.toArray)(), (0, rxjs_1.map)(function (pointArray) {
                        var points = __spreadArray([], pointArray, true);
                        points.sort(function (a, b) { return a.trackPositionPct - b.trackPositionPct; });
                        return points;
                    }));
                    return [4 /*yield*/, (0, rxjs_1.lastValueFrom)(points$.pipe((0, rxjs_1.map)(function (point) { return point.lap; }), (0, rxjs_1.distinct)(), (0, rxjs_1.count)()))];
                case 2:
                    totalLaps = _a.sent();
                    return [4 /*yield*/, (0, rxjs_1.lastValueFrom)(trackMap)];
                case 3:
                    trackArray = _a.sent();
                    if (normalize) {
                        minLat = Infinity;
                        maxLat = -Infinity;
                        minLon = Infinity;
                        maxLon = -Infinity;
                        for (_i = 0, trackArray_1 = trackArray; _i < trackArray_1.length; _i++) {
                            trackPoint = trackArray_1[_i];
                            minLat = Math.min(minLat, trackPoint.lat);
                            minLon = Math.min(minLon, trackPoint.lon);
                            maxLat = Math.max(maxLat, trackPoint.lat);
                            maxLon = Math.max(maxLon, trackPoint.lon);
                        }
                        latRange = maxLat - minLat;
                        lonRange = maxLon - minLon;
                        latCenter_1 = (minLat + maxLat) / 2;
                        lonCenter_1 = (minLon + maxLon) / 2;
                        scale_1 = Math.max(latRange, lonRange);
                        normalizedTrackArray = trackArray.map(function (point) { return ({
                            samples: point.samples,
                            trackPositionPct: point.trackPositionPct,
                            lat: ((point.lat - latCenter_1) / scale_1) + 0.5,
                            lon: ((point.lon - lonCenter_1) / scale_1) + 0.5
                        }); });
                        return [2 /*return*/, {
                                map: normalizedTrackArray,
                                totalLaps: totalLaps
                            }];
                    }
                    else {
                        return [2 /*return*/, {
                                map: trackArray,
                                totalLaps: totalLaps,
                            }];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
var telemetryFile = "C:/Users/zm/Documents/iRacing/telemetry/dallarap217_watkinsglen 2021 fullcourse 2022-06-17 20-13-00.ibt";
generateFromFile(telemetryFile, 250).then(console.log);
