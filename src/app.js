const express = require('express');
const authRoutes = require('./routes/auth.routes');
const translationsRoutes = require('./routes/translations.routes');
const app = express();

app.use(express.json({ limit: '2mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/translations', translationsRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Error interno del servidor' });
});

module.exports = app;