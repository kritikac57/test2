function checkAdminAuth(req, res, next) {
  if (req.session && req.session.adminLoggedIn) {
    return next();
  } else {
    res.redirect('/admin/login');
  }
}

module.exports = checkAdminAuth;