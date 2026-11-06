(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * Solar panel output for the planner.
     *
     * data/solar/<id>.json holds a typical year of hourly weather for a town, from the EU's PVGIS
     * (its TMY: typical meteorological year), fetched once by scripts/update-solar.js:
     *   { id, lat, lon, source, start: 'UTC hour 0', ghi, dni, dhi, t: [8760] } (W/m², °C)
     * plus PVGIS's own yearly yield for 1 kW facing north at 20° (pvcalc) as a check.
     * From it the app works out what panels of any size, direction and tilt make every half hour.
     * Nothing is sent anywhere when the app runs; the file is part of the site.
     */

    // One town per network area (lat, lon), and which networks default to it.
    Amber.SOLAR_LOCATIONS = [
        { id: 'sydney', name: 'Sydney', state: 'NSW', lat: -33.87, lon: 151.21, networks: ['ausgrid'] },
        { id: 'newcastle', name: 'Newcastle', state: 'NSW', lat: -32.93, lon: 151.75, networks: [] },
        { id: 'penrith', name: 'Western Sydney (Penrith)', state: 'NSW', lat: -33.75, lon: 150.69, networks: ['endeavour'] },
        { id: 'wollongong', name: 'Wollongong', state: 'NSW', lat: -34.42, lon: 150.89, networks: [] },
        { id: 'canberra', name: 'Canberra', state: 'ACT', lat: -35.28, lon: 149.13, networks: ['evoenergy'] },
        { id: 'dubbo', name: 'Dubbo', state: 'NSW', lat: -32.25, lon: 148.60, networks: ['essential'] },
        { id: 'wagga', name: 'Wagga Wagga', state: 'NSW', lat: -35.12, lon: 147.37, networks: [] },
        { id: 'albury', name: 'Albury–Wodonga', state: 'NSW', lat: -36.08, lon: 146.92, networks: [] },
        { id: 'portmacquarie', name: 'Port Macquarie', state: 'NSW', lat: -31.43, lon: 152.91, networks: [] },
        { id: 'coffs', name: 'Coffs Harbour', state: 'NSW', lat: -30.30, lon: 153.11, networks: [] },
        { id: 'brisbane', name: 'Brisbane', state: 'QLD', lat: -27.47, lon: 153.03, networks: ['energex'] },
        { id: 'goldcoast', name: 'Gold Coast', state: 'QLD', lat: -28.02, lon: 153.40, networks: [] },
        { id: 'sunshinecoast', name: 'Sunshine Coast', state: 'QLD', lat: -26.65, lon: 153.07, networks: [] },
        { id: 'adelaide', name: 'Adelaide', state: 'SA', lat: -34.93, lon: 138.60, networks: ['sapn'] },
        { id: 'mountgambier', name: 'Mount Gambier', state: 'SA', lat: -37.83, lon: 140.78, networks: [] },
        { id: 'portaugusta', name: 'Port Augusta', state: 'SA', lat: -32.49, lon: 137.77, networks: [] },
        { id: 'melbourne', name: 'Melbourne', state: 'VIC', lat: -37.81, lon: 144.96, networks: ['citipower', 'jemena', 'united energy', 'ausnet'] },
        { id: 'geelong', name: 'Geelong', state: 'VIC', lat: -38.15, lon: 144.36, networks: ['powercor'] },
        { id: 'ballarat', name: 'Ballarat', state: 'VIC', lat: -37.56, lon: 143.85, networks: [] },
        { id: 'bendigo', name: 'Bendigo', state: 'VIC', lat: -36.76, lon: 144.28, networks: [] },
        { id: 'mildura', name: 'Mildura', state: 'VIC', lat: -34.19, lon: 142.16, networks: [] },
        { id: 'traralgon', name: 'Traralgon', state: 'VIC', lat: -38.20, lon: 146.54, networks: [] }
    ];

    Amber.solarLocationFor = function (networkKey) {
        return Amber.SOLAR_LOCATIONS.find((l) => l.networks.includes(networkKey)) || Amber.SOLAR_LOCATIONS[0];
    };

    // Panel directions: compass azimuth the panels face (0 = north, 90 = east).
    Amber.SOLAR_ORIENTATIONS = {
        north: { label: 'North', faces: [0] },
        northeast: { label: 'North-east', faces: [45] },
        northwest: { label: 'North-west', faces: [315] },
        east: { label: 'East', faces: [90] },
        west: { label: 'West', faces: [270] },
        eastwest: { label: 'Half east, half west', faces: [90, 270] }
    };

    const RAD = Math.PI / 180;

    /** Sun position at a UTC instant (ms): { zenith, azimuth } in degrees (azimuth from north, clockwise). */
    Amber.sunPosition = function (ms, lat, lon) {
        const n = ms / 86400000 + 2440587.5 - 2451545.0;
        const L = (280.460 + 0.9856474 * n) % 360;
        const g = ((357.528 + 0.9856003 * n) % 360) * RAD;
        const lambda = (L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
        const eps = (23.439 - 0.0000004 * n) * RAD;
        const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
        const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
        const gmst = ((18.697374558 + 24.06570982441908 * n) % 24 + 24) % 24;
        const ha = ((gmst * 15 + lon) * RAD) - ra;
        const phi = lat * RAD;
        const cosZ = Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha);
        const zenith = Math.acos(Math.max(-1, Math.min(1, cosZ))) / RAD;
        let azimuth = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(ha)) / RAD;
        azimuth = (azimuth + 360) % 360;
        return { zenith, azimuth };
    };

    /**
     * Plane-of-array irradiance (W/m²) on panels tilted `tilt` facing `facing` (compass degrees):
     * beam (with glass reflection loss) + Hay–Davies sky diffuse + ground reflection (albedo 0.2).
     */
    Amber.planeIrradiance = function (sun, ghi, dni, dhi, tilt, facing, dayOfYear) {
        if (sun.zenith >= 90 || ghi <= 0) return 0;
        const beta = tilt * RAD;
        const z = sun.zenith * RAD;
        const cosAoi = Math.cos(z) * Math.cos(beta) + Math.sin(z) * Math.sin(beta) * Math.cos((sun.azimuth - facing) * RAD);
        const io = 1367 * (1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365));
        const ai = Math.min(1, Math.max(0, dni / io));
        const rb = Math.max(0, cosAoi) / Math.max(Math.cos(z), 0.087);
        const iam = cosAoi > 0.05 ? Math.max(0, 1 - 0.05 * (1 / cosAoi - 1)) : 0;
        const beam = dni * Math.max(0, cosAoi) * iam;
        const sky = dhi * (ai * rb + (1 - ai) * (1 + Math.cos(beta)) / 2);
        const ground = ghi * 0.2 * (1 - Math.cos(beta)) / 2;
        return Math.max(0, beam + sky + ground);
    };

    /**
     * Hourly AC output (kWh) of 1 kW of panels for a weather year: cell temperature from air
     * temperature and sunlight, −0.4 %/°C above 25 °C, then system losses (PVGIS's default 14 %).
     * opts: { tilt, orientation (key of SOLAR_ORIENTATIONS), lossPct, shadingPct }.
     */
    Amber.solarHourlyPerKw = function (weather, opts) {
        const o = opts || {};
        const faces = (Amber.SOLAR_ORIENTATIONS[o.orientation] || Amber.SOLAR_ORIENTATIONS.north).faces;
        const tilt = o.tilt != null ? o.tilt : 20;
        const derate = (1 - (o.lossPct != null ? o.lossPct : 14) / 100) * (1 - (o.shadingPct || 0) / 100);
        const out = new Float64Array(weather.ghi.length);
        const start = Date.UTC(2001, 0, 1);
        const offset = weather.minuteOffset != null ? weather.minuteOffset : 30;
        for (let h = 0; h < out.length; h++) {
            const ghi = weather.ghi[h];
            if (!(ghi > 0)) continue;
            const ms = start + h * 3600000 + offset * 60000;
            const sun = Amber.sunPosition(ms, weather.lat, weather.lon);
            const doy = Math.floor(h / 24) + 1;
            let poa = 0;
            faces.forEach((f) => { poa += Amber.planeIrradiance(sun, ghi, weather.dni[h], weather.dhi[h], tilt, f, doy) / faces.length; });
            const cell = weather.t[h] + 0.032 * poa;
            out[h] = Math.max(0, (poa / 1000) * (1 - 0.004 * (cell - 25)) * derate);
        }
        return out;
    };

    function dayOfYearNoLeap(dateStr) {
        const m = parseInt(dateStr.substring(5, 7), 10);
        let d = parseInt(dateStr.substring(8, 10), 10);
        if (m === 2 && d === 29) d = 28;
        return Math.round((Date.UTC(2001, m - 1, d) - Date.UTC(2001, 0, 1)) / 86400000);
    }

    /**
     * Half-hourly AC output (kWh) of 1 kW of panels on the planner's year (NEM time): each NEM
     * half hour takes its share of the typical year's matching UTC hour, split by the sun's height.
     */
    Amber.solarSlotsPerKw = function (year, weather, opts) {
        const hourly = Amber.solarHourlyPerKw(weather, opts);
        const out = new Float64Array(year.n);
        const start = Date.UTC(2001, 0, 1);
        const weight = (ms) => Math.max(0, Math.cos(Amber.sunPosition(ms, weather.lat, weather.lon).zenith * RAD));
        for (let d = 0; d < year.days; d++) {
            const doy = dayOfYearNoLeap(year.dates[d]);
            for (let s = 0; s < 48; s++) {
                // NEM = UTC + 10 h: this half hour starts at UTC hour (s/2 − 10) of the NEM date.
                let utcHalf = s - 20;
                let day = doy;
                if (utcHalf < 0) { utcHalf += 48; day = (doy + 364) % 365; }
                const h = day * 24 + Math.floor(utcHalf / 2);
                const kwh = hourly[h];
                if (!(kwh > 0)) continue;
                const first = start + h * 3600000;
                const a = weight(first + 15 * 60000);
                const b = weight(first + 45 * 60000);
                const share = a + b > 0 ? (utcHalf % 2 === 0 ? a : b) / (a + b) : 0.5;
                out[d * 48 + s] = kwh * share;
            }
        }
        return out;
    };

    /** Clip a system's half-hourly output at its inverter's AC power (kW). */
    Amber.clipToInverter = function (slots, inverterKw) {
        if (!(inverterKw > 0)) return slots;
        const max = inverterKw * 0.5;
        const out = new Float64Array(slots.length);
        let clipped = 0;
        for (let i = 0; i < slots.length; i++) {
            out[i] = Math.min(slots[i], max);
            clipped += slots[i] - out[i];
        }
        out.clipped = clipped;
        return out;
    };

    const weatherCache = Object.create(null);

    /** Load a town's typical weather year (browser). */
    Amber.loadSolarWeather = async function (id, fetcher) {
        if (!weatherCache[id]) {
            const get = fetcher || (async (url) => {
                const res = await fetch(url, { cache: 'force-cache' });
                if (!res.ok) throw new Error(`No solar data for ${id}`);
                return res.json();
            });
            weatherCache[id] = get(`data/solar/${id}.json`).catch((err) => { delete weatherCache[id]; throw err; });
        }
        return weatherCache[id];
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
