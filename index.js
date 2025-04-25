const express = require('express');
const app = express();
const routes = require('./route');
const db = require('./db/connection');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios'); 
const session = require('express-session');

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(session({
  secret: 'login12345',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using https
}));
// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Use the routes
app.use('/', routes);

app.get('/donation-result', (req, res) => {
  const status = req.query.status;
  res.render('donation-result', { status });
});

app.post('/initiate-payment', async (req, res) => {
  const { name, email, phone_number, amount } = req.body;
  
  // Generate a unique transaction ID
  const transactionId = 'TX' + Date.now();

  // PhonePe test credentials
  const merchantId = 'PGTESTPAYUAT77';
  const saltKey = '14fa5465-f8a7-443f-8477-f986b8fcfde9';
  const saltIndex = 1;

  // Prepare the payload
  const payload = {
    merchantId: merchantId,
    merchantTransactionId: transactionId,
    merchantUserId: 'MUID' + Date.now(),
    amount: amount * 100, // amount in paise
    redirectUrl: `http://localhost:8000/donation-callback`,
    redirectMode: 'POST',
    callbackUrl: `http://localhost:8000/donation-callback`,
    mobileNumber: phone_number,
    paymentInstrument: {
      type: 'PAY_PAGE'
    }
  };

  const payloadString = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadString).toString('base64');

  // Generate X-VERIFY header
  const string = payloadBase64 + '/pg/v1/pay' + saltKey;
  const sha256 = crypto.createHash('sha256').update(string).digest('hex');
  const xVerify = sha256 + '###' + saltIndex;

  try {
    // Insert the donation with status 'pending'
    await db.query(
      'INSERT INTO donations (name, email, phone_number, amount, status, transaction_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, email, phone_number, amount, 'pending', transactionId]
    );

    const response = await axios.post(
      'https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay',
      {
        request: payloadBase64
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-VERIFY': xVerify
        }
      }
    );

    // Redirect to PhonePe payment page
    res.redirect(response.data.data.instrumentResponse.redirectInfo.url);
  } catch (error) {
    console.error('Error initiating donation payment:', error);
    res.status(500).send('Error initiating donation payment');
  }
});

app.post('/donation-callback', async (req, res) => {
  // Handle the payment callback
  console.log('Donation payment callback received:', req.body);
  
  // Update the donation status in your database
  const { transactionId, code } = req.body; // Adjust according to PhonePe's actual response structure

  try {
    const paymentStatus = code === 'PAYMENT_SUCCESS' ? 'completed' : 'failed';
    await db.query('UPDATE donations SET status = $1 WHERE transaction_id = $2', [paymentStatus, transactionId]);
    
    // Redirect to a thank you page or show an appropriate message
    res.redirect('/donation-result?status=' + paymentStatus);
  } catch (error) {
    console.error('Error updating donation status:', error);
    res.status(500).send('Error updating donation status');
  }
});


app.post('/payment-callback', async (req, res) => {
  // Handle the payment callback
  console.log('Payment callback received:', req.body);
  
  // Update the payment status in your database
  const { transactionId, paymentStatus } = req.body; // Adjust according to PhonePe's actual response structure

  try {
    await db.query('UPDATE food_orders SET status = $1 WHERE id = $2', [paymentStatus, transactionId]);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error updating payment status:', error);
    res.status(500).send('Error updating payment status');
  }
});


app.get('/nearest-ngos', async (req, res) => {
  const { lat, lng } = req.query;
  
  try {
    const result = await db.query('SELECT * FROM ngos');
    const ngos = result.rows;
    
    const nearestNGOs = ngos.map(ngo => ({
      ...ngo,
      distance: calculateDistance(lat, lng, ngo.latitude, ngo.longitude)
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3); // Get top 3 nearest NGOs
    
    res.json(nearestNGOs);
  } catch (error) {
    console.error('Error fetching nearest NGOs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in km
  return distance;
}

// Start the server
const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});