// 🔑 API Key ของคุณ
const API_KEY = "56u0NzJGcQbBnhc7BeYm";

// กำหนด basemap styles
const basemaps = {
    "Google-like Streets": `https://api.maptiler.com/maps/streets/style.json?key=${API_KEY}`,
    "Dark Mode": `https://api.maptiler.com/maps/darkmatter/style.json?key=${API_KEY}`,
    "Outdoor": `https://api.maptiler.com/maps/outdoor/style.json?key=${API_KEY}`
};

// สร้างแผนที่ MapLibre
const map = new maplibregl.Map({
    container: "map",
    style: basemaps["Google-like Streets"], // ค่าเริ่มต้น
    center: [98.9853, 18.7883], // เชียงใหม่
    zoom: 12,
    pitch: 45,
    bearing: -17
});

// เพิ่ม Navigation Control
map.addControl(new maplibregl.NavigationControl(), "top-left");

// ✅ Custom basemap switcher (popup style)
class BasemapPopupControl {
    onAdd(map) {
        this._map = map;
        this._container = document.createElement("div");
        this._container.className = "maplibregl-ctrl maplibregl-ctrl-basemap-popup";

        // popup menu
        const menu = document.createElement("div");
        menu.className = "basemap-menu";
        Object.keys(basemaps).forEach(name => {
            const item = document.createElement("div");
            item.textContent = name;
            item.onclick = () => {
                // Store current checked layers before style change
                const checkedLayers = getCheckedLayers();

                map.setStyle(basemaps[name]);

                // Reload layers after style is loaded
                map.once('styledata', () => {
                    reloadLayersAfterStyleChange(checkedLayers);
                });

                map.flyTo({ center: [98.9853, 18.7883], zoom: 12 });
                menu.classList.remove("show");
            };
            menu.appendChild(item);
        });
        this._container.appendChild(menu);

        // ปุ่มหลัก
        const btn = document.createElement("button");
        btn.innerHTML = `<i class="fa-solid fa-layer-group"></i>`;
        btn.onclick = () => {
            menu.classList.toggle("show");
        };
        this._container.appendChild(btn);

        return this._container;
    }
    onRemove() {
        this._container.parentNode.removeChild(this._container);
        this._map = undefined;
    }
}
map.addControl(new BasemapPopupControl(), "top-right");

// dictionary แปล label → ไทย
const labelMap = {
    "TRN": "ด้านคมนาคม",
    "TEC": "ด้านการท่องเที่ยวและเศรษฐกิจ",
    "ENV": "ด้านสิ่งแวดล้อม",
    "EDC": "ด้านการศึกษาและวัฒนธรรม",
    "PSG": "ด้านความปลอดภัยและการปกครอง",
    "HLT": "ด้านสาธารณสุข",
    "RES": "ด้านที่พักอาศัยและอื่นๆ"
};

// mapping label → สีเข้ม
const CATEGORY_COLORS = {
    "TRN": "#6c7d85",  // คมนาคม
    "TEC": "#FFA726",  // ท่องเที่ยว
    "ENV": "#87da8d",  // สิ่งแวดล้อม
    "EDC": "#85c0ef",  // การศึกษา
    "PSG": "#d17472",  // ความปลอดภัย
    "HLT": "#bf2457",  // สาธารณสุข
    "RES": "#a38478"   // ที่อยู่อาศัย
};

// mapping label → สีอ่อน
const CATEGORY_LIGHT = {
    "TRN": "#cfd8dc",
    "TEC": "#ffe0b2",
    "ENV": "#c8e6c9",
    "EDC": "#bbdefb",
    "PSG": "#ffcdd2",
    "HLT": "#f8bbd0",
    "RES": "#d7ccc8"
};

// ✅ ฟังก์ชันสร้าง Marker วงกลม (กลางอ่อน ขอบเข้ม)
function createCircleMarker(darkColor, lightColor) {
    const el = document.createElement("div");
    el.style.width = "22px";
    el.style.height = "22px";
    el.style.borderRadius = "50%";
    el.style.background = lightColor;              // สีตรงกลาง
    el.style.border = `4px solid ${darkColor}`;    // ขอบเข้ม
    el.style.cursor = "pointer";
    return el;
}

// โหลดข้อมูล detections จาก API
map.on("load", () => {
    // map.addSource("detections", {
    //     type: "geojson",
    //     data: "/svi_api/detections"  
    // });

    // // add layer
    // map.addLayer({
    //     id: "detections-layer",
    //     type: "circle",
    //     source: "detections",
    //     paint: {
    //         "circle-radius": 6,
    //         "circle-color": [
    //             "match",
    //             ["get", "label"],
    //             ...Object.entries(CATEGORY_COLORS).flat(),
    //             "#888"  // default color
    //         ]
    //     }
    // });

    //  map.on("click", "detections-layer", (e) => {
    //     const feature = e.features[0];
    //     const label = feature.properties.label || "-";
    //     const labelThai = labelMap[label] || label;
    //     const conf = feature.properties.conf ? (feature.properties.conf * 100).toFixed(2) + "%" : "-";
    //     const [lng, lat] = feature.geometry.coordinates;
    //     showStreetView(lat, lng);
    //     const popupContent = `
    //         <div class="custom-popup">
    //             <b>ประเภท:</b> ${labelThai} (${label})<br>
    //             <b>ความเชื่อมั่น:</b> ${conf}<br>
    //             <b>Lat:</b> ${lat.toFixed(6)}<br>
    //             <b>Lng:</b> ${lng.toFixed(6)}
    //         </div>
    //     `;
    //     new maplibregl.Popup()
    //         .setLngLat([lng, lat])
    //         .setHTML(popupContent)
    //         .addTo(map);
    // });

    // Initialize layers based on checked checkboxes
    initializeCheckedLayers();
});

// show google street view in iframe
function showStreetView(lat, lng) {
    const gApiKey = "AIzaSyDz7XeV2UKhACZL1A7KHEk0uZc_HlP0j6w";
    const iframe = `
        <iframe
            width="100%"
            height="100%"
            style="border:0; border-radius:8px;"
            loading="lazy"
            allowfullscreen
            src="https://www.google.com/maps/embed/v1/streetview?location=${lat},${lng}&key=${gApiKey}">
        </iframe>
    `;
    document.getElementById("preview").innerHTML = iframe;
}

// Get currently checked layers
function getCheckedLayers() {
    const checkedLayers = [];
    ["TRN", "TEC", "ENV", "EDC", "PSG", "HLT", "RES"].forEach(layer => {
        const checkbox = document.getElementById(layer);
        if (checkbox && checkbox.checked) {
            checkedLayers.push(layer);
        }
    });
    return checkedLayers;
}

// Reload layers after basemap style change
function reloadLayersAfterStyleChange(layersToReload) {
    // Wait a bit for the style to fully load
    setTimeout(() => {
        layersToReload.forEach(layer => {
            const sourceId = `detections-${layer}`;
            const layerId = `detections-layer-${layer}`;

            // Add source if it doesn't exist
            if (!map.getSource(sourceId)) {
                map.addSource(sourceId, {
                    type: "geojson",
                    data: `/svi_api/detections/${layer}`
                });
            }

            // Add layer if it doesn't exist
            if (!map.getLayer(layerId)) {
                map.addLayer({
                    id: layerId,
                    type: "circle",
                    source: sourceId,
                    paint: {
                        "circle-radius": 6,
                        "circle-color": CATEGORY_COLORS[layer] || "#888",
                        "circle-stroke-color": "#ffffff",
                        "circle-stroke-width": 1,
                        "circle-opacity": 0.8
                    }
                });

                // Re-add event handlers
                addLayerEventHandlers(layerId);
            }
        });
    }, 100); // Small delay to ensure style is fully loaded
}

// Initialize layers for checked checkboxes on page load
function initializeCheckedLayers() {
    ["TRN", "TEC", "ENV", "EDC", "PSG", "HLT", "RES"].forEach(layer => {
        const checkbox = document.getElementById(layer);
        if (checkbox && checkbox.checked) {
            loadLayerByCheckbox(layer);
        }
    });
}

function loadLayerByCheckbox(layer) {
    const checkbox = document.getElementById(layer);
    const isChecked = checkbox.checked;
    const sourceId = `detections-${layer}`;
    const layerId = `detections-layer-${layer}`;  // ใช้ ID ที่ไม่ซ้ำกัน

    if (isChecked) {
        // เพิ่ม source และ layer
        if (!map.getSource(sourceId)) {
            // Show loading state
            checkbox.disabled = true;

            map.addSource(sourceId, {
                type: "geojson",
                data: `/svi_api/detections/${layer}`
            });

            // Re-enable checkbox after source is loaded
            map.on('sourcedata', function onSourceData(e) {
                if (e.sourceId === sourceId && e.isSourceLoaded) {
                    checkbox.disabled = false;
                    map.off('sourcedata', onSourceData);
                }
            });
        }

        if (!map.getLayer(layerId)) {
            map.addLayer({
                id: layerId,
                type: "circle",
                source: sourceId,
                paint: {
                    "circle-radius": 6,
                    "circle-color": CATEGORY_COLORS[layer] || "#888",
                    "circle-stroke-color": "#ffffff",
                    "circle-stroke-width": 1,
                    "circle-opacity": 0.8
                }
            });

            // เพิ่ม event handlers สำหรับแต่ละ layer
            addLayerEventHandlers(layerId);
        }
    } else {
        // ลบ layer และ source
        if (map.getLayer(layerId)) {
            map.removeLayer(layerId);
        }
        if (map.getSource(sourceId)) {
            map.removeSource(sourceId);
        }
    }
}

// เพิ่ม event handlers สำหรับ layer
function addLayerEventHandlers(layerId) {
    // Click event to show popup and street view
    map.on("click", layerId, (e) => {
        const feature = e.features[0];
        const label = feature.properties.label || "-";
        const labelThai = labelMap[label] || label;
        const conf = feature.properties.conf ? (feature.properties.conf * 100).toFixed(2) + "%" : "-";
        const [lng, lat] = feature.geometry.coordinates;

        // Show street view
        showStreetView(lat, lng);

        // Show popup
        const popupContent = `
            <div class="custom-popup">
                <b>ประเภท:</b> ${labelThai} (${label})<br>
                <b>ความเชื่อมั่น:</b> ${conf}<br>
                <b>Lat:</b> ${lat.toFixed(6)}<br>
                <b>Lng:</b> ${lng.toFixed(6)}
            </div>
        `;
        new maplibregl.Popup()
            .setLngLat([lng, lat])
            .setHTML(popupContent)
            .addTo(map);
    });

    // Mouse events
    map.on("mouseenter", layerId, () => {
        map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", layerId, () => {
        map.getCanvas().style.cursor = "";
    });
}

// เพิ่ม event listener ให้ checkbox (รวม RES)
["TRN", "TEC", "ENV", "EDC", "PSG", "HLT", "RES"].forEach(layer => {
    const checkbox = document.getElementById(layer);
    if (checkbox) {
        checkbox.addEventListener("change", () => loadLayerByCheckbox(layer));
    }
});


