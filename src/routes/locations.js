/**
 * Locations Routes
 * 
 * Handles user location preferences for API filtering
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { pool } = require('../config/database');
const fs = require('fs');
const path = require('path');

// Load geo IDs from JSON file
const geoIdsPath = path.join(__dirname, '../../chrome-extension/common-geoids.json');
const geoIds = JSON.parse(fs.readFileSync(geoIdsPath, 'utf8'));

/**
 * GET /locations/available - Get all available cities
 */
router.get('/locations/available', (req, res) => {
    try {
        // Flatten the geoIds object into a single array
        const cities = [];
        for (const state in geoIds) {
            geoIds[state].forEach(city => {
                cities.push({
                    name: city.name,
                    geoId: city.geoId,
                    state: state.replace('_', ' ').toUpperCase()
                });
            });
        }
        
        res.json({
            success: true,
            cities: cities.sort((a, b) => a.name.localeCompare(b.name)),
            total: cities.length
        });
    } catch (error) {
        console.error('Error loading cities:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load cities'
        });
    }
});

/**
 * GET /locations/user - Get user's selected locations
 */
router.get('/locations/user', requireAuth, async (req, res) => {
    try {
        const [locations] = await pool.execute(
            'SELECT id, city_name, geo_id, state_code, created_at FROM user_locations WHERE user_id = ? ORDER BY city_name',
            [req.userId]
        );
        
        res.json({
            success: true,
            locations,
            count: locations.length
        });
    } catch (error) {
        console.error('Error fetching user locations:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch locations'
        });
    }
});

/**
 * POST /locations/user - Add location to user's preferences
 */
router.post('/locations/user', requireAuth, async (req, res) => {
    try {
        const { cityName, geoId, stateCode } = req.body;
        
        if (!cityName || !geoId) {
            return res.status(400).json({
                success: false,
                message: 'City name and geo ID are required'
            });
        }
        
        // Check user's plan limit
        const [user] = await pool.execute(
            'SELECT plan FROM users WHERE id = ?',
            [req.userId]
        );
        
        if (!user.length) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        const { getPlan } = require('../config/plans');
        const planDetails = getPlan(user[0].plan);
        
        // Check current location count
        const [currentLocations] = await pool.execute(
            'SELECT COUNT(*) as count FROM user_locations WHERE user_id = ?',
            [req.userId]
        );
        
        const locationCount = currentLocations[0].count;
        
        // Check if plan allows more locations
        if (planDetails.locationLimit !== null && locationCount >= planDetails.locationLimit) {
            return res.status(403).json({
                success: false,
                message: `Your ${user[0].plan} plan allows up to ${planDetails.locationLimit} location(s). Upgrade to add more.`,
                limit: planDetails.locationLimit,
                current: locationCount
            });
        }
        
        // Add location
        await pool.execute(
            'INSERT INTO user_locations (user_id, city_name, geo_id, state_code) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE city_name = VALUES(city_name)',
            [req.userId, cityName, geoId, stateCode]
        );
        
        res.json({
            success: true,
            message: 'Location added successfully'
        });
        
    } catch (error) {
        console.error('Error adding location:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add location'
        });
    }
});

/**
 * DELETE /locations/user/:id - Remove location from user's preferences
 */
router.delete('/locations/user/:id', requireAuth, async (req, res) => {
    try {
        const locationId = parseInt(req.params.id);
        
        const [result] = await pool.execute(
            'DELETE FROM user_locations WHERE id = ? AND user_id = ?',
            [locationId, req.userId]
        );
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Location not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Location removed successfully'
        });
        
    } catch (error) {
        console.error('Error removing location:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove location'
        });
    }
});

module.exports = router;
