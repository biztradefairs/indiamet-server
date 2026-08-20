require('dotenv').config();
const bcrypt = require('bcryptjs');
const database = require('../src/config/database');

async function resetAdminPassword() {
  const email = (process.env.ADMIN_EMAIL || 'admin@indiamet.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  await database.connect();
  const sequelize = database.getConnection();
  const hash = await bcrypt.hash(password, 10);

  const [tables] = await sequelize.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND lower(tablename) IN ('users', 'user')`
  );

  if (!tables.length) {
    throw new Error('Users table not found');
  }

  const tableName = tables[0].tablename;
  const quotedTable = `"${tableName}"`;

  const [existing] = await sequelize.query(
    `SELECT id, email FROM ${quotedTable} WHERE lower(email) = :email LIMIT 1`,
    { replacements: { email } }
  );

  if (!existing.length) {
    await sequelize.query(
      `INSERT INTO ${quotedTable} (id, name, email, password, role, status, "createdAt", "updatedAt")
       VALUES (gen_random_uuid(), :name, :email, :password, 'admin', 'active', NOW(), NOW())`,
      {
        replacements: {
          name: 'Administrator',
          email,
          password: hash
        }
      }
    );
    console.log(`Created admin ${email}`);
  } else {
    await sequelize.query(
      `UPDATE ${quotedTable}
       SET password = :password, role = 'admin', status = 'active', "updatedAt" = NOW()
       WHERE lower(email) = :email`,
      { replacements: { password: hash, email } }
    );
    console.log(`Updated password for ${email}`);
  }

  const matches = await bcrypt.compare(password, hash);
  console.log(`Password verify: ${matches ? 'OK' : 'FAILED'}`);
  console.log(`Email: ${email}`);
  console.log('Password: admin123');

  await database.disconnect();
}

resetAdminPassword().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
