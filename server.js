// server.js - Analytics Service with MongoDB
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
  max: 10,
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
    await visitsCollection.createIndex({ ip: 1, date: 1, site: 1 }, { unique: true });
    await visitsCollection.createIndex({ timestamp: -1 });
    await visitsCollection.createIndex({ site: 1 });
    
    console.log('✅ MongoDB connected!');
    
    const count = await visitsCollection.countDocuments();
    const uniqueIPs = await visitsCollection.distinct('ip');
    console.log(`📊 Loaded ${count} visits, ${uniqueIPs.length} unique IPs`);
    
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
    const totalVisits = await visitsCollection.countDocuments();
    const uniqueIPs = await visitsCollection.distinct('ip');
    
    res.json({
      service: 'Analytics Service',
      status: 'running',
      version: '2.0.0',
      database: 'MongoDB',
      uptime: process.uptime(),
      stats: {
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
    const { site, page, referrer } = req.body;
    const timestamp = new Date();
    const date = getTodayString();
    
    const visitData = {
      ip,
      date,
      timestamp,
      page: page || '/',
      referrer: referrer || 'direct',
      site: site || 'unknown',
      userAgent: req.headers['user-agent']
    };
    
    let isNew = false;
    try {
      await visitsCollection.insertOne(visitData);
      isNew = true;
      console.log(`📊 New visit: ${ip.substring(0, 10)}... → ${site}${page}`);
    } catch (error) {
      if (error.code !== 11000) throw error;
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
    
    const [
      totalVisits,
      uniqueIPs,
      todayCount,
      weekCount,
      monthCount,
      bySite,
      byDate,
      recentVisits
    ] = await Promise.all([
      visitsCollection.countDocuments(),
      visitsCollection.distinct('ip').then(ips => ips.length),
      visitsCollection.countDocuments({ date: today }),
      visitsCollection.countDocuments({ date: { $gte: weekAgo } }),
      visitsCollection.countDocuments({ date: { $gte: monthAgo } }),
      
      visitsCollection.aggregate([
        { $group: { _id: '$site', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]).toArray(),
      
      visitsCollection.aggregate([
        { $group: { _id: '$date', count: { $sum: 1 } } },
        { $sort: { _id: -1 } },
        { $limit: 30 }
      ]).toArray(),
      
      visitsCollection.find()
        .sort({ timestamp: -1 })
        .limit(50)
        .toArray()
    ]);
    
    res.json({
      summary: {
        total_visits: totalVisits,
        unique_ips: uniqueIPs,
        today: todayCount,
        last_7_days: weekCount,
        last_30_days: monthCount
      },
      by_site: bySite.reduce((obj, item) => ({ 
        ...obj, 
        [item._id]: item.count 
      }), {}),
      by_date: byDate.reduce((obj, item) => ({ 
        ...obj, 
        [item._id]: item.count 
      }), {}),
      recent_visits: recentVisits.map(v => ({
        time: v.timestamp.toISOString(),
        ip: v.ip.substring(0, 10) + '...',
        site: v.site,
        page: v.page,
        referrer: v.referrer
      }))
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
    const { format = 'json' } = req.query;
    const visits = await visitsCollection.find().sort({ timestamp: -1 }).toArray();
    
    if (format === 'csv') {
      let csv = 'Date,Time,Site,Page,Referrer,IP\n';
      
      for (const visit of visits) {
        const timestamp = visit.timestamp.toISOString();
        const [date, time] = timestamp.split('T');
        csv += `${date},${time},${visit.site},${visit.page},${visit.referrer},${visit.ip.substring(0, 10)}...\n`;
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.csv');
      res.send(csv);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=analytics.json');
      res.json({ visits });
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
    console.log(`🕐 Time: ${new Date().toISOString()}`);
    console.log('='.repeat(50));
  });
}

start().catch(error => {
  console.error('Failed to start:', error);
  process.exit(1);
});
