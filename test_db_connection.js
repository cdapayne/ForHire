require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
    console.log('Testing MySQL connection...');
    console.log('Host:', process.env.DB_HOST);
    console.log('Database:', process.env.DB_NAME);
    console.log('User:', process.env.DB_USER);
    
    try {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            connectTimeout: 10000
        });
        
        console.log('✅ Connection successful!');
        
        const [rows] = await connection.execute('SELECT COUNT(*) as count FROM jobs');
        console.log(`✅ Found ${rows[0].count} jobs in database`);
        
        await connection.end();
        console.log('✅ Connection closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Connection failed:');
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error errno:', error.errno);
        
        if (error.code === 'ECONNREFUSED') {
            console.error('\n💡 MySQL server is not running. Start it with:');
            console.error('   - MySQL Workbench > Server > Start Server');
            console.error('   - Or via command line if installed');
        }
        
        process.exit(1);
    }
}

testConnection();
