/**
 * Основной сервер для API расчета доставки CDEK
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import deliveryRoutes from './routes/delivery.js';

// Загрузка переменных окружения
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Логирование запросов
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Проверка конфигурации
const requiredEnvVars = ['CDEK_API_URL', 'CDEK_ACCOUNT', 'CDEK_SECURE_PASSWORD'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Отсутствуют обязательные переменные окружения:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('\nСоздайте файл .env на основе .env.example');
  process.exit(1);
}

// Роуты
app.get('/', (req, res) => {
  res.json({
    message: 'CDEK Delivery API',
    version: '1.0.0',
    endpoints: {
      'GET /api/delivery/cities': 'Поиск городов по названию',
      'POST /api/delivery/calculate': 'Расчет стоимости доставки',
      'POST /api/delivery/calculate-by-tariff': 'Расчет по конкретному тарифу',
      'GET /api/delivery/offices': 'Получение списка офисов (ПВЗ)',
    },
    docs: 'https://github.com/cdek-it/api-docs',
  });
});

app.use('/api/delivery', deliveryRoutes);

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Ошибка сервера:', err);
  res.status(500).json({
    error: 'Внутренняя ошибка сервера',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log('🚀 Сервер запущен!');
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🌍 CDEK API: ${process.env.CDEK_API_URL}`);
  console.log(`📝 Режим: ${process.env.NODE_ENV || 'development'}`);
  console.log('\nДоступные эндпоинты:');
  console.log(`  GET  http://localhost:${PORT}/api/delivery/cities?q=Москва`);
  console.log(`  POST http://localhost:${PORT}/api/delivery/calculate`);
  console.log(`  POST http://localhost:${PORT}/api/delivery/calculate-by-tariff`);
  console.log(`  GET  http://localhost:${PORT}/api/delivery/offices?cityCode=44`);
});




