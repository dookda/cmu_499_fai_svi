const express = require("express");
const { Pool } = require("pg");
const app = express();
const port = 3000;

// ให้ express เสิร์ฟไฟล์ static (index.html ฯลฯ) จากโฟลเดอร์ www
app.use("/", express.static("www"));

// ===========================
//  ตั้งค่า PostgreSQL
// ===========================
const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "Project499",
  password: "1234",   // เปลี่ยนเป็นรหัสจริง
  port: 5433          // ตรวจสอบ port
});

// ===========================
//  ฟังก์ชัน query geometry
// ===========================
async function queryGeoJSON(tableName, usePoint = false) {
  let sql;
  if (usePoint) {
    // สำหรับตารางที่เก็บ latitude/longitude
    sql = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', jsonb_agg(feature)
      )
      FROM (
        SELECT jsonb_build_object(
          'type','Feature',
          'geometry', ST_AsGeoJSON(
              ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
          )::jsonb,
          'properties', to_jsonb(row) - 'latitude' - 'longitude'
        ) AS feature
        FROM public."${tableName}" AS row
      ) features;
    `;
  } else {
    // สำหรับตารางที่ geometry เป็น polygon/line
    sql = `
      SELECT jsonb_build_object(
        'type', 'FeatureCollection',
        'features', jsonb_agg(feature)
      )
      FROM (
        SELECT jsonb_build_object(
          'type','Feature',
          'geometry', ST_AsGeoJSON(ST_Transform(geometry,4326))::jsonb,
          'properties', to_jsonb(row) - 'geometry'
        ) AS feature
        FROM public."${tableName}" AS row
      ) features;
    `;
  }
  const result = await pool.query(sql);
  return result.rows[0].jsonb_build_object;
}

// ===========================
//  Routes
// ===========================

// entry_points (point)
app.get("/entry_points", async (req, res) => {
  try {
    res.json(await queryGeoJSON("entry_points", true));
  } catch (err) {
    console.error(err);
    res.status(500).send("DB error");
  }
});

// detections_matched_all (point)
app.get("/detections", async (req, res) => {
  try {
    res.json(await queryGeoJSON("detections_matched_all", true));
  } catch (err) {
    console.error(err);
    res.status(500).send("DB error");
  }
});

// Hexagon layers
const hexTables = [
  "hexagon_TRN",
  "hexagon_TEC",
  "hexagon_ENV",
  "hexagon_RES",
  "hexagon_HLT",
  "hexagon_PSG",
  "hexagon_EDC",
  "hexagon_conf_label"
];

// endpoint เช่น /hexagons/trn
app.get("/hexagons/:layer", async (req, res) => {
  try {
    const { layer } = req.params;

    let tableName;
    if (layer.toLowerCase() === "conf") {
      tableName = "hexagon_conf_label";   // ✅ ชื่อจริงใน DB
    } else {
      tableName = `hexagon_${layer.toUpperCase()}`;
    }

    res.json(await queryGeoJSON(tableName));
  } catch (err) {
    console.error("❌ Error fetching hexagons:", err);
    res.status(500).send("DB error");
  }
});

// ✅ routes ของ 6 layer หลัก
["EDC47_hconf", "ENV47_hconf", "TRN47_hconf", "TEC47_hconf", "PSG47_hconf", "HLT47_hconf"].forEach(layer => {
  app.get("/" + layer, async (req, res) => {
    try {
      const data = await queryGeoJSON(layer); // ✅ ใช้ queryGeoJSON
      res.json(data);
    } catch (err) {
      console.error("❌ Error fetching:", layer, err);
      res.status(500).json({ error: "Database error" });
    }
  });
});

// ===========================
//  Routes: Urban services
// ===========================

const serviceTables = {
  TRN: "TRN47_hconf",
  TEC: "TEC47_hconf",
  ENV: "ENV47_hconf",
  EDC: "EDC47_hconf",
  PSG: "PSG47_hconf",
  HLT: "HLT47_hconf"
};

app.get("/services/:type", async (req, res) => {
  try {
    const type = req.params.type.toUpperCase();
    const tableName = serviceTables[type];
    if (!tableName) {
      return res.status(400).json({ error: "Unknown service type" });
    }
    const data = await queryGeoJSON(tableName);  // ใช้ฟังก์ชันเดิม
    res.json(data);
  } catch (err) {
    console.error("❌ Error fetching service:", err);
    res.status(500).json({ error: "Database error" });
  }
});

const fetch = require("node-fetch");

app.get("/route", async (req, res) => {
  const { origin, dest } = req.query;
  try {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&mode=driving&key=AIzaSyDz7XeV2UKhACZL1A7KHEk0uZc_HlP0j6w`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    console.error("❌ Route fetch error:", err);
    res.status(500).json({ error: "Route fetch failed" });
  }
});

// ===========================
//  Start server
// ===========================
app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});
