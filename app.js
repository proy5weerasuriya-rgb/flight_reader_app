document.addEventListener('DOMContentLoaded', () => {
    // Initialize map centered on Finland
    const map = L.map('map', {
        center: [64.9146, 25.8118], // Center of Finland approx
        zoom: 5,
        zoomControl: false // Move to bottom right
    });

    // Dark theme map using CartoDB Dark Matter
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Bounding Box for Finland
    const LAMIN = 59.7;
    const LAMAX = 70.1;
    const LOMIN = 19.0;
    const LOMAX = 31.6;
    const OPENSKY_URL = `https://opensky-network.org/api/states/all?lamin=${LAMIN}&lomin=${LOMIN}&lamax=${LAMAX}&lomax=${LOMAX}`;

    let planeMarkers = {}; // Store markers by icao24 ID

    // A beautiful responsive SVG plane icon. Points straight up by default.
    const svgPlane = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#38bdf8" width="28px" height="28px"><path d="M21,16v-2l-8-5V3.5c0-0.83-0.67-1.5-1.5-1.5S10,2.67,10,3.5V9l-8,5v2l8-2.5V19l-2,1.5V22l3.5-1l3.5,1v-1.5L13,19v-5.5L21,16z"/></svg>`;

    const createPlaneIcon = (heading) => {
        return L.divIcon({
            html: `<div style="transform: rotate(${heading}deg); transform-origin: center; width: 28px; height: 28px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
                    ${svgPlane}
                   </div>`,
            className: 'plane-icon',
            iconSize: [28, 28],
            iconAnchor: [14, 14],
            popupAnchor: [0, -14]
        });
    };

    const updateUI = (count) => {
        document.getElementById('flight-count').innerText = count;
        const now = new Date();
        document.getElementById('last-update').innerText = now.toLocaleTimeString([], { hour12: false });
    };

    const toggleLoading = (isLoading) => {
        const btn = document.getElementById('refresh-btn');
        if (isLoading) {
            btn.classList.add('loading');
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg> Refreshing...`;
        } else {
            btn.classList.remove('loading');
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg> Refresh Now`;
        }
    };

    const fetchFlights = async () => {
        try {
            toggleLoading(true);
            const response = await fetch(OPENSKY_URL);
            if (!response.ok) {
                if(response.status === 429) {
                    console.warn("OpenSky Rate Limit Exceeded. Trying again in 15 seconds.");
                } else {
                    console.error("Failed to fetch flight data. Status:", response.status);
                }
                toggleLoading(false);
                return;
            }
            
            const data = await response.json();
            const states = data.states || [];
            
            updateUI(states.length);
            
            const updatedIds = new Set();

            states.forEach(flight => {
                const icao24 = flight[0];
                const callsign = flight[1] ? flight[1].trim() : 'UNKNOWN';
                const originCountry = flight[2] || 'Unknown';
                const longitude = flight[5];
                const latitude = flight[6];
                const altitude = flight[7] || flight[13] || 0; // baro or geo
                const velocity = flight[9] || 0;
                const trueTrack = flight[10] || 0;

                // validate coords
                if (longitude === null || latitude === null) return;
                
                updatedIds.add(icao24);

                const popupHtml = `
                    <div class="flight-popup">
                        <h3>🛩️ ${callsign !== 'UNKNOWN' ? callsign : icao24.toUpperCase()}</h3>
                        <p><span>Country</span> <strong>${originCountry}</strong></p>
                        <p><span>Altitude</span> <strong>${Math.round(altitude)} m</strong></p>
                        <p><span>Speed</span> <strong>${Math.round(velocity * 3.6)} km/h</strong></p>
                        <p><span>Heading</span> <strong>${Math.round(trueTrack)}°</strong></p>
                    </div>
                `;

                if (planeMarkers[icao24]) {
                    // Update existing marker
                    planeMarkers[icao24].setLatLng([latitude, longitude]);
                    planeMarkers[icao24].setIcon(createPlaneIcon(trueTrack));
                    const popup = planeMarkers[icao24].getPopup();
                    if (popup && popup.isOpen()) {
                        popup.setContent(popupHtml);
                    } else {
                        planeMarkers[icao24].setPopupContent(popupHtml);
                    }
                } else {
                    // Create new marker
                    const marker = L.marker([latitude, longitude], {
                        icon: createPlaneIcon(trueTrack)
                    }).bindPopup(popupHtml);
                    
                    marker.addTo(map);
                    planeMarkers[icao24] = marker;
                }
            });

            // Remove markers for planes that left the bounding box
            Object.keys(planeMarkers).forEach(icao24 => {
                if (!updatedIds.has(icao24)) {
                    map.removeLayer(planeMarkers[icao24]);
                    delete planeMarkers[icao24];
                }
            });
            
            toggleLoading(false);
        } catch (error) {
            console.error("Error fetching flights:", error);
            toggleLoading(false);
        }
    };

    // Events
    document.getElementById('refresh-btn').addEventListener('click', () => {
        // Prevent spam clicking while loading
        if (!document.getElementById('refresh-btn').classList.contains('loading')) {
            fetchFlights();
        }
    });

    // Initial fetch
    fetchFlights();

    // Auto refresh every 15 seconds
    setInterval(fetchFlights, 15000);
});
