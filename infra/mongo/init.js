// MongoDB Initialization Script
// Runs once on first startup to create the app user and indexes

db = db.getSiblingDB('diligence');

// Create a non-root application user with readWrite access
db.createUser({
  user: 'ddapp',
  pwd: 'ddapppassword',
  roles: [{ role: 'readWrite', db: 'diligence' }],
});

// Create collections with schema validation hints
db.createCollection('deals');
db.createCollection('findings');
db.createCollection('crossrefs');
db.createCollection('reports');
db.createCollection('jobs');

// Indexes for performance
db.deals.createIndex({ createdAt: -1 });
db.deals.createIndex({ status: 1 });

db.findings.createIndex({ dealId: 1 });
db.findings.createIndex({ dealId: 1, domain: 1 });
db.findings.createIndex({ dealId: 1, severity: 1 });

db.crossrefs.createIndex({ dealId: 1 });
db.crossrefs.createIndex({ finding1Id: 1 });
db.crossrefs.createIndex({ finding2Id: 1 });

db.reports.createIndex({ dealId: 1 });
db.reports.createIndex({ jobId: 1 });

db.jobs.createIndex({ dealId: 1 });
db.jobs.createIndex({ status: 1 });
db.jobs.createIndex({ createdAt: -1 });

print('✅ MongoDB initialized: diligence database, user, and indexes created.');
