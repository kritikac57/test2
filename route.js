const express = require('express');
const router = express.Router();
const db = require('./db/connection');

// Home page route - Show all food orders
router.get('/', async (req, res) => {
  try {
    const ordersResult = await db.query(`
      SELECT o.id, o.customer_name, o.address, o.phone_number, o.created_at
      FROM food_orders o
      ORDER BY o.created_at DESC
    `);
    
    const orders = ordersResult.rows;
    
    // Get food items for each order
    for (const order of orders) {
      const itemsResult = await db.query(`
        SELECT id, item_name, expiry_date
        FROM food_items
        WHERE order_id = $1
        ORDER BY expiry_date
      `, [order.id]);
      
      order.food_items = itemsResult.rows;
    }
    
    res.render('index', { orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).send('Server error');
  }
});

// Display the form to add a new food order
router.get('/add', (req, res) => {
  res.render('add_order');
});

// Process the form submission
router.post('/add', async (req, res) => {
  try {
    const { customer_name, address, phone_number, item_names, expiry_dates } = req.body;
    
    // Start a transaction
    await db.query('BEGIN');
    
    // Insert the order
    const orderResult = await db.query(
      'INSERT INTO food_orders (customer_name, address, phone_number) VALUES ($1, $2, $3) RETURNING id',
      [customer_name, address, phone_number]
    );
    
    const orderId = orderResult.rows[0].id;
    
    // Insert food items
    const itemNames = Array.isArray(item_names) ? item_names : [item_names];
    const expiryDates = Array.isArray(expiry_dates) ? expiry_dates : [expiry_dates];
    
    for (let i = 0; i < itemNames.length; i++) {
      if (itemNames[i] && expiryDates[i]) {
        await db.query(
          'INSERT INTO food_items (order_id, item_name, expiry_date) VALUES ($1, $2, $3)',
          [orderId, itemNames[i], expiryDates[i]]
        );
      }
    }
    
    // Commit the transaction
    await db.query('COMMIT');
    
    res.redirect('/');
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error adding order:', error);
    res.status(500).send('Server error');
  }
});

router.get('/donate', (req, res) => {
    res.render('donate');
  });
  
  // Process donation form submission
  router.post('/donate', async (req, res) => {
    try {
      const { name, email, phone_number, amount } = req.body;
      
      // Insert the donation
      await db.query(
        'INSERT INTO donations (name, email, phone_number, amount) VALUES ($1, $2, $3, $4)',
        [name, email, phone_number, amount]
      );
      
      res.redirect('/donations');
    } catch (error) {
      console.error('Error adding donation:', error);
      res.status(500).send('Server error');
    }
  });
  
  // Display all donations
  router.get('/donations', async (req, res) => {
    try {
      const donationsResult = await db.query(`
        SELECT id, name, email, phone_number, amount, created_at
        FROM donations
        ORDER BY created_at DESC
      `);
      
      const donations = donationsResult.rows;
      
      // Calculate total amount
      const totalAmount = donations.reduce((sum, donation) => sum + parseFloat(donation.amount), 0);
      
      res.render('donations', { donations, totalAmount });
    } catch (error) {
      console.error('Error fetching donations:', error);
      res.status(500).send('Server error');
    }
  });
   
  router.get('/sidebar', (req, res) => {
    res.render('sidebar');
  });


module.exports = router;