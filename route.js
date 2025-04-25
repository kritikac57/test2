const express = require('express');
const router = express.Router();
const db = require('./db/connection');
const checkAdminAuth = require('./middleware/authMiddleware');
const md5 = require('md5');


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
router.get('/donate-food', (req, res) => {
  res.render('donate-food');
});

// Process the form submission
router.post('/add', async (req, res) => {
  try {
    const { customer_name, address, phone_number, item_names, expiry_dates, quantities } = req.body;
    
    // Start a transaction
    await db.query('BEGIN');
    
    // Insert the order with initial status
    const orderResult = await db.query(
      'INSERT INTO food_orders (customer_name, address, phone_number, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [customer_name, address, phone_number, 'pending']
    );
    
    const orderId = orderResult.rows[0].id;
    
    // Insert food items
    const itemNames = Array.isArray(item_names) ? item_names : [item_names];
    const expiryDates = Array.isArray(expiry_dates) ? expiry_dates : [expiry_dates];
    const itemQuantities = Array.isArray(quantities) ? quantities : [quantities];
    
    for (let i = 0; i < itemNames.length; i++) {
      if (itemNames[i] && expiryDates[i] && itemQuantities[i]) {
        await db.query(
          'INSERT INTO food_items (order_id, item_name, expiry_date, quantity) VALUES ($1, $2, $3, $4)',
          [orderId, itemNames[i], expiryDates[i], itemQuantities[i]]
        );
      }
    }
    
    // Commit the transaction
    await db.query('COMMIT');
    
    // Redirect to a thank you page or back to the home page
    res.redirect(`/thank-you/${orderId}`);
  } catch (error) {
    await db.query('ROLLBACK');
    console.error('Error adding order:', error);
    res.status(500).send('Server error');
  }
});

router.get('/thank-you/:orderId', async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const orderResult = await db.query('SELECT * FROM food_orders WHERE id = $1', [orderId]);
    const order = orderResult.rows[0];
    
    if (!order) {
      return res.status(404).send('Order not found');
    }
    
    res.render('thank-you', { orderId, order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).send('Server error');
  }
});

router.get('/track-order', (req, res) => {
  res.render('track-order');
});

router.post('/track-order', async (req, res) => {
  try {
    const { orderId } = req.body;
    const orderResult = await db.query('SELECT * FROM food_orders WHERE id = $1', [orderId]);
    const order = orderResult.rows[0];
    
    if (!order) {
      return res.render('track-order', { error: 'Order not found' });
    }
    
    res.render('track-order', { order });
  } catch (error) {
    console.error('Error tracking order:', error);
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
  

  router.get('/admin/login', (req, res) => {
    res.render('admin/login');
  });
  router.post('/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const hashedPassword = md5(password);
      const result = await db.query('SELECT * FROM admin_users WHERE username = $1', [username]);
      
      if (result.rows.length > 0) {
        const user = result.rows[0];

        if (hashedPassword === user.password) {
          req.session.adminLoggedIn = true;
          req.session.adminUsername = user.username;
          res.redirect('/admin');
        } else {
          res.render('admin/login', { error: 'Invalid credentials' });
        }
      } else {
        res.render('admin/login', { error: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Error during login:', error);
      res.status(500).send('Server error');
    }
  });
  
  router.get('/admin/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
      }
      res.redirect('/admin/login');
    });
  });
  
  // Apply the checkAdminAuth middleware to all routes starting with '/admin/'
  router.use('/admin', checkAdminAuth);
  


  // Display all donations
  router.get('/admin/donations', async (req, res) => {
    try {
      const donationsResult = await db.query(`
        SELECT id, name, email, phone_number, amount, created_at,status
        FROM donations
        ORDER BY created_at DESC
      `);
      
      const donations = donationsResult.rows;
      
      // Calculate total amount
      const totalAmount = donations.reduce((sum, donation) => sum + parseFloat(donation.amount), 0);
      
      res.render('admin/donations', { donations, totalAmount, activePage: 'donations' });
    } catch (error) {
      console.error('Error fetching donations:', error);
      res.status(500).send('Server error');
    }
  });
   

  router.get('/admin', (req, res) => {
    res.render('admin/index',{ activePage: 'dashboard' });
  }); 
router.get('/admin/food-orders', async (req, res) => {
  try {
    const ordersResult = await db.query(`
        SELECT o.id, o.customer_name, o.address, o.phone_number, o.created_at, o.status, o.pickup_by
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
    
    res.render('admin/food-orders', { orders, activePage: 'food-orders' });
  } catch (error) {
    console.error('Error fetching food orders:', error);
    res.status(500).send('Server error');
  }
});

router.post('/admin/update-order-status', async (req, res) => {
  try {
    const { orderId, status, pickupBy } = req.body;
    let updateQuery = 'UPDATE food_orders SET status = $1';
    let queryParams = [status];

    if (status === 'out_for_pickup') {
      updateQuery += ', pickup_by = $2';
      queryParams.push(pickupBy);
    }
    
    updateQuery += ' WHERE id = $' + (queryParams.length + 1);
    queryParams.push(orderId);

    await db.query(updateQuery, queryParams);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});
router.get('/add-ngo', (req, res) => {
  res.render('add-ngo');
});

router.post('/add-ngo', async (req, res) => {
  try {
    const { ngo_name, address, contact_number, location, latitude, longitude } = req.body;
    
    await db.query(
      'INSERT INTO ngos (name, address, contact_number, location, latitude, longitude) VALUES ($1, $2, $3, $4, $5, $6)',
      [ngo_name, address, contact_number, location, latitude, longitude]
    );
    
    res.redirect('/ngos'); // Redirect to a page showing all NGOs
  } catch (error) {
    console.error('Error adding NGO:', error);
    res.status(500).send('Server error');
  }
});
router.get('/ngos', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM ngos ORDER BY name');
    const ngos = result.rows;
    res.render('ngos', { ngos });
  } catch (error) {
    console.error('Error fetching NGOs:', error);
    res.status(500).send('Server error');
  }
});


// Route to approve a donation
router.post('/approve-donation/:id', async (req, res) => {
  try {
    await db.query('UPDATE food_orders SET status = $1 WHERE id = $2', ['approved', req.params.id]);
    res.redirect('/admin/food-orders');
  } catch (error) {
    console.error('Error approving donation:', error);
    res.status(500).send('Server error');
  }
});

// Route to mark a donation as out for pickup
router.post('/out-for-pickup/:id', async (req, res) => {
  try {
    await db.query('UPDATE food_orders SET status = $1 WHERE id = $2', ['out_for_pickup', req.params.id]);
    res.redirect('/admin/food-orders');
  } catch (error) {
    console.error('Error marking donation as out for pickup:', error);
    res.status(500).send('Server error');
  }
});

// Route to assign a pickup person
router.post('/assign-pickup/:id', async (req, res) => {
  try {
    const { pickup_by } = req.body;
    await db.query('UPDATE food_orders SET status = $1, pickup_by = $2 WHERE id = $3', ['assigned_for_pickup', pickup_by, req.params.id]);
    res.redirect('/admin/food-orders');
  } catch (error) {
    console.error('Error assigning pickup person:', error);
    res.status(500).send('Server error');
  }
});

// Route to mark a donation as picked up
router.post('/mark-picked/:id', async (req, res) => {
  try {
    await db.query('UPDATE food_orders SET status = $1, pickup_time = CURRENT_TIMESTAMP WHERE id = $2', ['picked', req.params.id]);
    res.redirect('/admin/food-orders');
  } catch (error) {
    console.error('Error marking donation as picked:', error);
    res.status(500).send('Server error');
  }
});

// Route to mark a donation as donated
router.post('/mark-donated/:id', async (req, res) => {
  try {
    await db.query('UPDATE food_orders SET status = $1 WHERE id = $2', ['donated', req.params.id]);
    res.redirect('/admin/food-orders');
  } catch (error) {
    console.error('Error marking donation as donated:', error);
    res.status(500).send('Server error');
  }
});



module.exports = router;