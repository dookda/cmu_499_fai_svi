// ✅ API Key ของ Google Maps Directions (ใช้ generate link/route ผ่าน backend)
const GOOGLE_API_KEY = "AIza..."; // <- ของจริงอยู่ใน server แล้ว

// Threshold ของแต่ละบริการ (นาที)
const thresholds = {
    TRN: 20, TEC: 20, ENV: 15, EDC: 30, PSG: 15, HLT: 30,
};

// ===========================
// 1) สร้างแผนที่ + Basemap
// ===========================
var map = L.map("map").setView([18.7883, 98.9853], 13);

// Basemaps
const googleStreets = L.tileLayer(
    "http://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
    { subdomains: ["mt0", "mt1", "mt2", "mt3"], attribution: "© Google" }
).addTo(map);

const googleSatellite = L.tileLayer(
    "http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
    { subdomains: ["mt0", "mt1", "mt2", "mt3"], attribution: "© Google" }
);

const baseLayers = {
    "Google Streets": googleStreets,
    "Google Satellite": googleSatellite,
};

// Basemap control
L.control.layers(baseLayers, null, { position: "topright" }).addTo(map);

// ===========================
// 2) Marker ผู้ใช้
// ===========================
var userMarker;
var routeLayer = L.layerGroup().addTo(map);

navigator.geolocation.getCurrentPosition(
    (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        userMarker = L.marker([lat, lng]).addTo(map).bindPopup("📍 คุณอยู่ที่นี่");
        map.setView([lat, lng], 14);
    },
    (err) => {
        console.warn("❌ ใช้ตำแหน่งจริงไม่ได้:", err.message);
        const lat = 18.752299, lng = 99.032208;
        userMarker = L.marker([lat, lng]).addTo(map).bindPopup("📍 Default: Chiang Mai");
        map.setView([lat, lng], 13);
    }
);

// ===========================
// 3) สีบริการ
// ===========================
// เส้นขอบ (เข้ม)
const CATEGORY_COLORS = {
    TRN: "#6c7d85",
    TEC: "#FFA726",
    ENV: "#87da8d",
    EDC: "#85c0ef",
    PSG: "#d17472",
    HLT: "#bf2457",
};

// สีพื้น (อ่อน)
const CATEGORY_LIGHT = {
    TRN: "#cfd8dc",
    TEC: "#ffe0b2",
    ENV: "#c8e6c9",
    EDC: "#bbdefb",
    PSG: "#ffcdd2",
    HLT: "#f8bbd0",
};

// ===========================
// 4) โหลด Service Layer
// ===========================
async function loadServiceLayer(serviceType) {
    const res = await fetch(`/svi_api/services/${serviceType}`);
    const data = await res.json();

    return L.geoJSON(data, {
        pointToLayer: (feature, latlng) =>
            L.circleMarker(latlng, {
                radius: 6,
                fillColor: CATEGORY_LIGHT[serviceType],
                color: CATEGORY_COLORS[serviceType],
                weight: 2,
                opacity: 1,
                fillOpacity: 0.9,
            }),
        onEachFeature: (feature, layer) => {
            layer.bindPopup(`
              <b>${serviceType}</b><br>
              Label: ${feature.properties.label || "-"}<br>
              Conf: ${feature.properties.conf || "-"}
            `);
        },
    });
}

var serviceLayers = {};
var activeLayer = null;

async function loadAllServiceLayers() {
    for (let key in CATEGORY_COLORS) {
        serviceLayers[key] = await loadServiceLayer(key);
    }
}
loadAllServiceLayers();

// ===========================
// 5) Event: เปลี่ยนประเภทบริการ
// ===========================
document.getElementById("serviceType").addEventListener("change", function () {
    const selected = this.value;
    if (activeLayer) map.removeLayer(activeLayer);
    if (serviceLayers[selected]) {
        activeLayer = serviceLayers[selected];
        activeLayer.addTo(map);
    }
});

// ===========================
// 6) Helper: decode polyline
// ===========================
function decodePolyline(encoded) {
    let points = [];
    let index = 0, lat = 0, lng = 0;

    while (index < encoded.length) {
        let b, shift = 0, result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlat = result & 1 ? ~(result >> 1) : result >> 1;
        lat += dlat;

        shift = 0;
        result = 0;
        do {
            b = encoded.charCodeAt(index++) - 63;
            result |= (b & 0x1f) << shift;
            shift += 5;
        } while (b >= 0x20);
        let dlng = result & 1 ? ~(result >> 1) : result >> 1;
        lng += dlng;

        points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
}

// ===========================
// 7) วิเคราะห์เส้นทาง
// ===========================
document.getElementById("analyzeBtn").addEventListener("click", async () => {
    if (!userMarker) {
        alert("ยังไม่ได้หาตำแหน่งผู้ใช้");
        return;
    }

    routeLayer.clearLayers();
    document.getElementById("results").innerHTML = "";

    const serviceType = document.getElementById("serviceType").value;
    const customTime = parseInt(document.getElementById("accessTime").value);
    const timeLimit = customTime || thresholds[serviceType];
    const userLatLng = userMarker.getLatLng();

    let data = await fetch(`/svi_api/services/${serviceType}`).then(r => r.json());

    if (!data.features || data.features.length === 0) {
        alert("⚠️ ไม่มีข้อมูลสำหรับเลเยอร์นี้");
        return;
    }

    const AVG_SPEED_KMH = 30;
    let maxDistMeters = (timeLimit / 60) * AVG_SPEED_KMH * 1000;

    let candidates = data.features.map(f => {
        const dest = f.geometry.coordinates;
        const d = map.distance(userLatLng, L.latLng(dest[1], dest[0]));
        return { feature: f, dist: d };
    }).filter(d => d.dist <= maxDistMeters);

    candidates.sort((a, b) => a.dist - b.dist);
    candidates = candidates.slice(0, 10);

    if (candidates.length === 0) {
        const div = document.createElement("div");
        div.className = "result-item";
        div.innerHTML = `
            ❌ คุณอยู่ห่างจากบริการประเภท <b>${serviceType}</b> 
            เกินเวลาที่กำหนด (${timeLimit} นาที)
        `;
        document.getElementById("results").appendChild(div);
        return;
    }

    for (let c of candidates) {
        const f = c.feature;
        const dest = f.geometry.coordinates;
        const origin = `${userLatLng.lat},${userLatLng.lng}`;
        const destination = `${dest[1]},${dest[0]}`;

        try {
            let res = await fetch(`/svi_api/route?origin=${origin}&dest=${destination}`);
            let json = await res.json();

            if (json.status === "OK") {
                const leg = json.routes[0].legs[0];
                const durationMin = leg.duration.value / 60;

                // ✅ เอาเฉพาะที่ "อยู่ในเวลาเข้าถึง"
                if (durationMin <= timeLimit) {
                    const coords = decodePolyline(json.routes[0].overview_polyline.points);

                    // polyline
                    const polyline = L.polyline(coords, {
                        color: "green",
                        weight: 4,
                        opacity: 0.8
                    }).addTo(routeLayer);

                    polyline.bindPopup(`
                    <b>${serviceType}</b><br>
                    ระยะทาง: ${leg.distance.text}<br>
                    เวลา: ${leg.duration.text}<br>
                    <a href="https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}" target="_blank">🔗 เปิดใน Google Maps</a>
                `);

                    // div box
                    const div = document.createElement("div");
                    div.className = "result-item";
                    div.innerHTML = `
                    <b>${serviceType}</b><br>
                    ระยะทาง: ${leg.distance.text}<br>
                    ระยะเวลา: ${leg.duration.text}<br>
                    เส้นทาง: <a href="https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}" target="_blank">Google Maps</a>
                `;
                    document.getElementById("results").appendChild(div);

                    // box ↔ polyline
                    div.onclick = () => {
                        map.fitBounds(polyline.getBounds());
                        polyline.openPopup();
                        document.querySelectorAll(".result-item").forEach(el => el.classList.remove("active"));
                        div.classList.add("active");
                    };
                    polyline.on("click", () => {
                        map.fitBounds(polyline.getBounds());
                        polyline.openPopup();
                        document.querySelectorAll(".result-item").forEach(el => el.classList.remove("active"));
                        div.classList.add("active");
                    });
                }
                // ❌ ถ้า durationMin > timeLimit → ข้ามไปเลย (ไม่ append)
            }
        } catch (err) {
            console.error("❌ Fetch route failed:", err);
        }
    }

});

// ===========================
// 8) Legend
// ===========================
const legend = L.control({ position: "bottomright" });
legend.onAdd = function () {
    const div = L.DomUtil.create("div", "info legend");
    div.innerHTML = "<h4>ประเภทบริการ</h4>";
    const labelName = {
        TRN: "คมนาคม", TEC: "ท่องเที่ยว", ENV: "สิ่งแวดล้อม",
        EDC: "การศึกษา", PSG: "ความปลอดภัย", HLT: "สาธารณสุข"
    };

    for (const key in CATEGORY_COLORS) {
        div.innerHTML += `
          <i style="background:${CATEGORY_COLORS[key]}; width:18px; height:18px; display:inline-block; margin-right:6px; border:1px solid #000;"></i>
          ${labelName[key]} (${key})<br>`;
    }
    return div;
};
legend.addTo(map);
