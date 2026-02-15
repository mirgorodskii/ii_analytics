// server.js - Analytics Service with MongoDB and Events Tracking
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { MongoClient } = require('mongodb');

const app = express();

// ============================================
// CONFIGURATION
// ============================================

const PORT = process.env.PORT || 8080;
const ADMIN_KEY = process.env.ADMIN_KEY || 'change-me-in-production';
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is required!');
  console.error('Add it to Railway Variables');
  process.exit(1);
}

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());

const trackLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 20, // Увеличили с 10 до 20 (больше событий)
  message: { error: 'Too many requests' }
});

// ============================================
// MONGODB CONNECTION
// ============================================

let db;
let visitsCollection;

async function connectDB() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    
    db = client.db('analytics');
    visitsCollection = db.collection('visits');
    
    // Create indexes
    // Unique index только для обычных визитов (по ip+date+site)
    await visitsCollection.createIndex(
      { ip: 1, date: 1, site: 1 }, 
      { unique: true, partialFilterExpression: { event: { $in: ['visit', null] } } }
    );
    await visitsCollection.createIndex({ timestamp: -1 });
    await visitsCollection.createIndex({ site: 1 });
    await visitsCollection.createIndex({ event: 1 });
    
    console.log('✅ MongoDB connected!');
    
    const count = await visitsCollection.countDocuments();
    const uniqueIPs = await visitsCollection.distinct('ip');
    console.log(`📊 Loaded ${count} records, ${uniqueIPs.length} unique IPs`);
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getClientIP(req) {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0] || 
         req.headers['x-real-ip'] || 
         'unknown';
}

function getTodayString() {
  return new Date().toISOString().split('T')[0];
}

function getDateDaysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
}

// ============================================
// ROUTES
// ============================================

app.get('/', async (req, res) => {
  try {
    const totalRecords = await visitsCollection.countDocuments();
    const totalVisits = await visitsCollection.countDocuments({ event: { $in: ['visit', null] } });
    const uniqueIPs = await visitsCollection.distinct('ip', { event: { $in: ['visit', null] } });
    
    res.json({
      service: 'Analytics Service',
      status: 'running',
      version: '2.1.0',
      database: 'MongoDB',
      uptime: process.uptime(),
      stats: {
        total_records: totalRecords,
        total_visits: totalVisits,
        unique_ips: uniqueIPs.length
      }
    });
  } catch (error) {
    res.status(500).json({
      service: 'Analytics Service',
      status: 'error',
      error: error.message
    });
  }
});

app.post('/track', trackLimiter, async (req, res) => {
  try {
    const ip = getClientIP(req);
    const { site, page, referrer, event, metadata } = req.body;
    const timestamp = new Date();
    const date = getTodayString();
    
    const visitData = {
      ip,
      timestamp,
      page: page || '/',
      referrer: referrer || 'direct',
      site: site || 'unknown',
      userAgent: req.headers['user-agent'],
      event: event || 'visit',
      metadata: metadata || {}
    };
    
    let isNew = false;
    let eventType = event || 'visit';
    
    // Для обычных визитов добавляем date для unique constraint
    if (eventType === 'visit' || !event) {
      visitData.date = date;
      
      try {
        await visitsCollection.insertOne(visitData);
        isNew = true;
        console.log(`📊 New visit: ${ip.substring(0, 10)}... → ${site}${page} (${metadata?.deviceType || 'unknown'})`);
      } catch (error) {
        if (error.code !== 11000) throw error;
        // Duplicate visit - это нормально
      }
    } else {
      // События (conversion, click, scroll, error, page_exit) - всегда записываем
      await visitsCollection.insertOne(visitData);
      isNew = true;
      
      const metaInfo = metadata?.type || metadata?.element?.text || metadata?.depth || '';
      console.log(`📊 Event: ${eventType} → ${site} ${metaInfo} (${ip.substring(0, 10)}...)`);
    }
    
    const total = await visitsCollection.countDocuments();
    
    res.json({ 
      tracked: true,
      unique: isNew,
      total
    });
    
  } catch (error) {
    console.error('Track error:', error);
    res.status(500).json({ error: 'Failed to track visit' });
  }
});

app.get('/stats', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const today = getTodayString();
    const weekAgo = getDateDaysAgo(7);
    const monthAgo = getDateDaysAgo(30);
    
    // Фильтр для обычных визитов
    const visitFilter = { event: { $in: ['visit', null] } };
    
    const [
      totalVisits,
      uniqueIPs,
      todayCount,
      weekCount,
      monthCount,
      bySite,
      byDate,
      byDevice,
      conversions,
      recentVisits,
      recentEvents
    ] = await Promise.all([
      visitsCollection.countDocuments(visitFilter),
      visitsCollection.distinct('ip', visitFilter).then(ips => ips.length),
      visitsCollection.countDocuments({ ...visitFilter, date: today }),
      visitsCollection.countDocuments({ ...visitFilter, date: { $gte: weekAgo } }),
      visitsCollection.countDocuments({ ...visitFilter, date: { $gte: monthAgo } }),
      
      // По сайтам
      visitsCollection.aggregate([
        { $match: visitFilter },
        { $group: { _id: '$site', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
      
      // По датам
      visitsCollection.aggregate([
        { $match: visitFilter },
        { $group: { _id: '$date', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 30 }
      ]).toArray(),
      
      // По устройствам
      visitsCollection.aggregate([
        { $match: visitFilter },
        { $group: { _id: '$metadata.deviceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
      
      // Конверсии
      visitsCollection.aggregate([
        { $match: { event: 'conversion' } },
        { $group: { _id: '$metadata.type', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
      
      // Последние визиты
      visitsCollection.find(visitFilter)
        .sort({ timestamp: -1 })
        .limit(20)
        .toArray(),
      
      // Последние события
      visitsCollection.find({ event: { $nin: ['visit', null] } })
        .sort({ timestamp: -1 })
        .limit(20)
        .toArray()
    ]);
    
    // Считаем conversion rate
    const conversionCount = await visitsCollection.countDocuments({ 
      event: 'conversion',
      'metadata.type': 'session_started'
    });
    const conversionRate = totalVisits > 0 
      ? ((conversionCount / totalVisits) * 100).toFixed(2) 
      : 0;
    
    res.json({
      summary: {
        total_visits: totalVisits,
        unique_ips: uniqueIPs,
        today: todayCount,
        last_7_days: weekCount,
        last_30_days: monthCount,
        conversions: conversionCount,
        conversion_rate: `${conversionRate}%`
      },
      by_site: bySite.reduce((obj, item) => ({ 
        ...obj, 
        [item._id]: item.count 
      }), {}),
      by_date: byDate.reduce((obj, item) => ({ 
        ...obj, 
        [item._id]: item.count 
      }), {}),
      by_device: byDevice.reduce((obj, item) => ({ 
        ...obj, 
        [item._id || 'unknown']: item.count 
      }), {}),
      conversions: conversions.reduce((obj, item) => ({ 
        ...obj, 
        [item._id || 'unknown']: item.count 
      }), {}),
      recent_visits: recentVisits.map(v => ({
        time: v.timestamp.toISOString(),
        ip: v.ip.substring(0, 10) + '...',
        site: v.site,
        page: v.page,
        device: v.metadata?.deviceType || 'unknown',
        referrer: v.referrer
      })),
      recent_events: recentEvents.map(e => ({
        time: e.timestamp.toISOString(),
        event: e.event,
        site: e.site,
        metadata: e.metadata
      }))
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

app.get('/stats/:site', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { site } = req.params;
    const today = getTodayString();
    const weekAgo = getDateDaysAgo(7);
    
    const visitFilter = { site, event: { $in: ['visit', null] } };
    
    const [
      todayCount,
      weekCount,
      byPage,
      byDate,
      byDevice,
      conversions
    ] = await Promise.all([
      visitsCollection.countDocuments({ ...visitFilter, date: today }),
      visitsCollection.countDocuments({ ...visitFilter, date: { $gte: weekAgo } }),
      
      visitsCollection.aggregate([
        { $match: visitFilter },
        { $group: { _id: '$page', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
      
      visitsCollection.aggregate([
        { $match: visitFilter },
        { $group: { _id: '$date', count: { $sum: 1 } } },
        { $sort: { _id: -1 } }
      ]).toArray(),
      
      visitsCollection.aggregate([
        { $match: visitFilter },
        { $group: { _id: '$metadata.device', count: { $sum: 1 } } }
      ]).toArray(),
      
      visitsCollection.countDocuments({ 
        site,
        event: 'conversion',
        'metadata.type': 'session_started'
      })
    ]);
    
    const total = byPage.reduce((sum, item) => sum + item.count, 0);
    const conversionRate = total > 0 
      ? ((conversions / total) * 100).toFixed(2) 
      : 0;
    
    res.json({
      site,
      summary: {
        total,
        today: todayCount,
        last_7_days: weekCount,
        conversions,
        conversion_rate: `${conversionRate}%`
      },
      by_page: byPage.reduce((obj, item) => ({ 
        ...obj, 
        [item._id]: item.count 
      }), {}),
      by_date: byDate.reduce((obj, item) => ({ 
        ...obj, 
        [item._id]: item.count 
      }), {}),
      by_device: byDevice.reduce((obj, item) => ({ 
        ...obj, 
        [item._id || 'unknown']: item.count 
      }), {})
    });
    
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

app.get('/admin/export', async (req, res) => {
  const adminKey = req.headers['x-admin-key'] || req.query.key;
  
  if (adminKey !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const { format = 'json', type = 'all' } = req.query;
    
    let query = {};
    if (type === 'visits') {
      query = { event: { $in: ['visit', null] } };
    } else if (type === 'events') {
      query = { event: { $nin: ['visit', null] } };
    }
    
    const records = await visitsCollection.find(query).sort({ timestamp: -1 }).toArray();
    
    if (format === 'csv') {
      let csv = 'Date,Time,Site,Page,Event,Device,Language,Timezone,Referrer,IP\n';
      
      for (const record of records) {
        const timestamp = record.timestamp.toISOString();
        const [date, time] = timestamp.split('T');
        csv += `${date},${time},${record.site},${record.page},${record.event || 'visit'},${record.metadata?.device || ''},${record.metadata?.language || ''},${record.metadata?.timezone || ''},${record.referrer},${record.ip.substring(0, 10)}...\n`;
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.json');
      res.json({ 
        exported_at: new Date().toISOString(),
        total_records: records.length,
        records 
      });
    }
    
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// START SERVER
// ============================================

async function start() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('📊 Analytics Service with MongoDB');
    console.log('='.repeat(50));
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🍃 Database: Connected`);
    console.log(`🔑 Admin key: ${ADMIN_KEY === 'change-me-in-production' ? '⚠️  NOT SET!' : '✅ OK'}`);
    console.log(`📈 Features: Visits + Events + Conversions`);
    console.log(`🕐 Time: ${new Date().toISOString()}`);
    console.log('='.repeat(50));
  });
}

start().catch(error => {
  console.error('Failed to start:', error);
  process.exit(1);
});
