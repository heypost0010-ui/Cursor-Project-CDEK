/**
 * Роуты для работы с доставкой CDEK
 */

import express from 'express';
import dotenv from 'dotenv';
import CDEKApiClient from '../cdek/api.js';

// Загрузка переменных окружения (на случай, если они еще не загружены)
dotenv.config();

const router = express.Router();

// Инициализация клиента CDEK API
const cdekClient = new CDEKApiClient(
  process.env.CDEK_API_URL,
  process.env.CDEK_ACCOUNT,
  process.env.CDEK_SECURE_PASSWORD
);

/**
 * GET /api/delivery/cities?q=Москва
 * Поиск городов по названию
 */
router.get('/cities', async (req, res) => {
  try {
    const { q, country_code = 'RU', size = 10 } = req.query;

    if (!q) {
      return res.status(400).json({
        error: 'Параметр "q" (название города) обязателен',
      });
    }

    const cities = await cdekClient.searchCities(q, country_code, parseInt(size));

    res.json({
      success: true,
      data: cities,
      count: cities.length,
    });
  } catch (error) {
    console.error('Ошибка при поиске городов:', error);
    res.status(500).json({
      error: 'Ошибка при поиске городов',
      message: error.message,
    });
  }
});

/**
 * GET /api/delivery/calculate (для тестирования через браузер)
 * Расчет стоимости доставки через query параметры
 * 
 * Пример: /api/delivery/calculate?fromCityCode=44&fromAddress=Москва&toCityCode=270&toAddress=Новосибирск&weight=2000&length=10&width=20&height=30
 */
router.get('/calculate', async (req, res) => {
  try {
    const {
      fromCityCode,
      fromAddress,
      toCityCode,
      toAddress,
      weight,
      length,
      width,
      height,
    } = req.query; // Используем query вместо body для GET

    // Валидация обязательных полей
    const errors = [];
    if (!fromCityCode) errors.push('fromCityCode обязателен');
    if (!toCityCode) errors.push('toCityCode обязателен');
    if (!weight) errors.push('weight обязателен');
    if (!length) errors.push('length обязателен');
    if (!width) errors.push('width обязателен');
    if (!height) errors.push('height обязателен');

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Ошибка валидации',
        details: errors,
      });
    }

    // Преобразование и валидация числовых значений
    const fromCode = parseInt(fromCityCode);
    const toCode = parseInt(toCityCode);
    const pkgWeight = parseInt(weight);
    const pkgLength = parseInt(length);
    const pkgWidth = parseInt(width);
    const pkgHeight = parseInt(height);

    // Проверка на валидность чисел
    if (isNaN(fromCode) || isNaN(toCode) || isNaN(pkgWeight) || 
        isNaN(pkgLength) || isNaN(pkgWidth) || isNaN(pkgHeight)) {
      return res.status(400).json({
        error: 'Ошибка валидации',
        details: ['Все числовые параметры должны быть валидными числами'],
      });
    }

    // Подготовка данных для запроса
    // В документации CDEK адреса обычно в формате "г. Москва, ул. Примерная, д. 1"
    // Если адрес короткий (только название города), добавляем префикс "г. "
    const formatAddress = (addr) => {
      if (!addr || !addr.trim()) return undefined;
      const trimmed = addr.trim();
      // Если адрес не начинается с "г. " и выглядит как просто название города, добавляем префикс
      if (!trimmed.startsWith('г. ') && !trimmed.includes(',')) {
        return `г. ${trimmed}`;
      }
      return trimmed;
    };

    const fromLocation = {
      code: fromCode,
    };
    const formattedFromAddress = formatAddress(fromAddress);
    if (formattedFromAddress) {
      fromLocation.address = formattedFromAddress;
    }

    const toLocation = {
      code: toCode,
    };
    const formattedToAddress = formatAddress(toAddress);
    if (formattedToAddress) {
      toLocation.address = formattedToAddress;
    }

    const packages = [
      {
        weight: pkgWeight,
        length: pkgLength,
        width: pkgWidth,
        height: pkgHeight,
      },
    ];

    // Выполнение расчета
    const result = await cdekClient.calculateDelivery({
      fromLocation,
      toLocation,
      packages,
    });

    // Форматирование ответа
    const formattedResult = {
      success: true,
      tariffs: result.tariff_codes?.map(tariff => ({
        code: tariff.tariff_code,
        name: tariff.tariff_name,
        description: tariff.tariff_description,
        cost: tariff.delivery_sum,
        periodMin: tariff.period_min,
        periodMax: tariff.period_max,
        calendarMin: tariff.calendar_min,
        calendarMax: tariff.calendar_max,
        // delivery_date_range находится внутри каждого тарифа
        deliveryDateRange: tariff.delivery_date_range ? {
          dateMin: tariff.delivery_date_range.min,
          dateMax: tariff.delivery_date_range.max,
        } : null,
      })) || [],
      errors: result.errors || [],
      warnings: result.warnings || [],
    };

    res.json(formattedResult);
  } catch (error) {
    console.error('Ошибка при расчете доставки:', error);
    res.status(500).json({
      error: 'Ошибка при расчете доставки',
      message: error.message,
    });
  }
});

/**
 * POST /api/delivery/calculate
 * Расчет стоимости доставки
 * 
 * Body:
 * {
 *   "fromCityCode": 44,
 *   "fromAddress": "г. Москва, ул. Примерная, д. 1",
 *   "toCityCode": 270,
 *   "toAddress": "г. Новосибирск",
 *   "weight": 2000,      // в граммах
 *   "length": 10,        // в см
 *   "width": 20,         // в см
 *   "height": 30         // в см
 * }
 */
router.post('/calculate', async (req, res) => {
  try {
    const {
      fromCityCode,
      fromAddress,
      toCityCode,
      toAddress,
      weight,
      length,
      width,
      height,
    } = req.body;

    // Валидация обязательных полей
    const errors = [];
    if (!fromCityCode) errors.push('fromCityCode обязателен');
    if (!fromAddress) errors.push('fromAddress обязателен');
    if (!toCityCode) errors.push('toCityCode обязателен');
    if (!toAddress) errors.push('toAddress обязателен');
    if (!weight) errors.push('weight обязателен');
    if (!length) errors.push('length обязателен');
    if (!width) errors.push('width обязателен');
    if (!height) errors.push('height обязателен');

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Ошибка валидации',
        details: errors,
      });
    }

    // Подготовка данных для запроса
    const fromLocation = {
      code: parseInt(fromCityCode),
      address: fromAddress,
    };

    const toLocation = {
      code: parseInt(toCityCode),
      address: toAddress,
    };

    const packages = [
      {
        weight: parseInt(weight),
        length: parseInt(length),
        width: parseInt(width),
        height: parseInt(height),
      },
    ];

    // Выполнение расчета
    const result = await cdekClient.calculateDelivery({
      fromLocation,
      toLocation,
      packages,
    });

    // Форматирование ответа
    const formattedResult = {
      success: true,
      tariffs: result.tariff_codes?.map(tariff => ({
        code: tariff.tariff_code,
        name: tariff.tariff_name,
        description: tariff.tariff_description,
        cost: tariff.delivery_sum,
        periodMin: tariff.period_min,
        periodMax: tariff.period_max,
        calendarMin: tariff.calendar_min,
        calendarMax: tariff.calendar_max,
        // delivery_date_range находится внутри каждого тарифа
        deliveryDateRange: tariff.delivery_date_range ? {
          dateMin: tariff.delivery_date_range.min,
          dateMax: tariff.delivery_date_range.max,
        } : null,
      })) || [],
      errors: result.errors || [],
      warnings: result.warnings || [],
    };

    res.json(formattedResult);
  } catch (error) {
    console.error('Ошибка при расчете доставки:', error);
    res.status(500).json({
      error: 'Ошибка при расчете доставки',
      message: error.message,
    });
  }
});

/**
 * POST /api/delivery/calculate-by-tariff
 * Расчет стоимости доставки по конкретному тарифу
 * 
 * Body:
 * {
 *   "tariffCode": 136,
 *   "fromCityCode": 44,
 *   "fromAddress": "г. Москва, ул. Примерная, д. 1",
 *   "toCityCode": 270,
 *   "toAddress": "г. Новосибирск",
 *   "weight": 2000,
 *   "length": 10,
 *   "width": 20,
 *   "height": 30,
 *   "services": [{"code": "INSURANCE", "parameter": "5000"}]
 * }
 */
router.post('/calculate-by-tariff', async (req, res) => {
  try {
    const {
      tariffCode,
      fromCityCode,
      fromAddress,
      toCityCode,
      toAddress,
      weight,
      length,
      width,
      height,
      services = [],
      shipmentPoint, // Код ПВЗ отправления (для тарифа 751)
      deliveryPoint, // Код ПВЗ доставки (для тарифа 751)
    } = req.body;

    // Валидация
    const errors = [];
    if (!tariffCode) errors.push('tariffCode обязателен');
    if (!fromCityCode) errors.push('fromCityCode обязателен');
    if (!fromAddress) errors.push('fromAddress обязателен');
    if (!toCityCode) errors.push('toCityCode обязателен');
    // toAddress опционален - для доставки на склад может не быть адреса
    if (!weight) errors.push('weight обязателен');
    if (!length) errors.push('length обязателен');
    if (!width) errors.push('width обязателен');
    if (!height) errors.push('height обязателен');

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Ошибка валидации',
        details: errors,
      });
    }

    // Для тарифа 751 (склад-склад) нужно указать склады
    // Если не указаны, попробуем найти их автоматически
    let finalShipmentPoint = shipmentPoint;
    let finalDeliveryPoint = deliveryPoint;

    if (parseInt(tariffCode) === 751) {
      // Для тарифа 751 нужны склады
      if (!finalShipmentPoint) {
        // Пытаемся найти ПВЗ в городе отправления
        try {
          // Сначала пробуем найти ПВЗ со сборным грузом
          let officesFrom = await cdekClient.getOffices(parseInt(fromCityCode), { 
            type: 'PVZ', 
            size: 10,
          });
          
          // Фильтруем по is_ltl (работает со сборным грузом)
          if (officesFrom && officesFrom.length > 0) {
            const ltlOffices = officesFrom.filter(office => office.is_ltl === true);
            if (ltlOffices.length > 0) {
              finalShipmentPoint = ltlOffices[0].code;
              console.log(`Автоматически найден ПВЗ отправления (LTL): ${finalShipmentPoint}`);
            } else {
              // Если нет LTL, берем первый доступный
              finalShipmentPoint = officesFrom[0].code;
              console.log(`Автоматически найден ПВЗ отправления: ${finalShipmentPoint}`);
            }
          }
        } catch (err) {
          console.warn('Не удалось найти ПВЗ отправления:', err.message);
        }
      }

      if (!finalDeliveryPoint && !toAddress) {
        // Для доставки до ПВЗ нужен delivery_point
        try {
          // Сначала пробуем найти ПВЗ со сборным грузом
          let officesTo = await cdekClient.getOffices(parseInt(toCityCode), { 
            type: 'PVZ', 
            size: 10,
          });
          
          // Фильтруем по is_ltl (работает со сборным грузом)
          if (officesTo && officesTo.length > 0) {
            const ltlOffices = officesTo.filter(office => office.is_ltl === true);
            if (ltlOffices.length > 0) {
              finalDeliveryPoint = ltlOffices[0].code;
              console.log(`Автоматически найден ПВЗ доставки (LTL): ${finalDeliveryPoint}`);
            } else {
              // Если нет LTL, берем первый доступный
              finalDeliveryPoint = officesTo[0].code;
              console.log(`Автоматически найден ПВЗ доставки: ${finalDeliveryPoint}`);
            }
          }
        } catch (err) {
          console.warn('Не удалось найти ПВЗ доставки:', err.message);
        }
      }
    }

    // Формируем toLocation: address опционален (для доставки на склад может не быть)
    const toLocation = {
      code: parseInt(toCityCode),
    };
    if (toAddress && toAddress.trim()) {
      toLocation.address = toAddress.trim();
    }

    const result = await cdekClient.calculateDeliveryByTariff({
      tariffCode: parseInt(tariffCode),
      fromLocation: {
        code: parseInt(fromCityCode),
        address: fromAddress,
      },
      toLocation: toLocation,
      packages: [
        {
          weight: parseInt(weight),
          length: parseInt(length),
          width: parseInt(width),
          height: parseInt(height),
        },
      ],
      services,
      shipmentPoint: finalShipmentPoint,
      deliveryPoint: finalDeliveryPoint,
    });

    // Логируем полный ответ от CDEK API для отладки
    console.log('CDEK API Full Response:', JSON.stringify(result, null, 2));

    const formattedResult = {
      success: true,
      tariffCode: result.tariff_code,
      deliveryCost: result.delivery_sum,
      totalCost: result.total_sum,
      periodMin: result.period_min,
      periodMax: result.period_max,
      calendarMin: result.calendar_min,
      calendarMax: result.calendar_max,
      weightCalc: result.weight_calc,
      currency: result.currency,
      services: result.services || [],
      deliveryDateRange: result.delivery_date_range ? {
        dateMin: result.delivery_date_range.date_min || result.delivery_date_range.min,
        dateMax: result.delivery_date_range.date_max || result.delivery_date_range.max,
      } : null,
      // Добавляем полный ответ для отладки (можно убрать в production)
      _raw: process.env.NODE_ENV !== 'production' ? result : undefined,
    };

    res.json(formattedResult);
  } catch (error) {
    console.error('Ошибка при расчете доставки по тарифу:', error);
    res.status(500).json({
      error: 'Ошибка при расчете доставки',
      message: error.message,
    });
  }
});

/**
 * GET /api/delivery/offices?cityCode=44
 * Получение списка офисов (ПВЗ) в городе
 */
router.get('/offices', async (req, res) => {
  try {
    const { cityCode, type = 'ALL' } = req.query;

    if (!cityCode) {
      return res.status(400).json({
        error: 'Параметр "cityCode" обязателен',
      });
    }

    const offices = await cdekClient.getOffices(parseInt(cityCode), {
      type,
    });

    res.json({
      success: true,
      data: offices,
      count: offices.length,
    });
  } catch (error) {
    console.error('Ошибка при получении офисов:', error);
    res.status(500).json({
      error: 'Ошибка при получении офисов',
      message: error.message,
    });
  }
});

/**
 * GET /api/delivery/tariffs?lang=rus
 * Получение списка доступных тарифов
 * 
 * Параметры:
 * - lang (опционально) - Язык ответа: 'rus', 'eng', 'zho' (по умолчанию 'rus')
 */
router.get('/tariffs', async (req, res) => {
  try {
    const { lang = 'rus' } = req.query;

    // Валидация языка
    const validLangs = ['rus', 'eng', 'zho'];
    if (!validLangs.includes(lang)) {
      return res.status(400).json({
        error: 'Ошибка валидации',
        details: [`Недопустимый язык. Допустимые значения: ${validLangs.join(', ')}`],
      });
    }

    const tariffs = await cdekClient.getTariffs(lang);

    res.json({
      success: true,
      data: tariffs,
      count: Array.isArray(tariffs) ? tariffs.length : 0,
    });
  } catch (error) {
    console.error('Ошибка при получении списка тарифов:', error);
    res.status(500).json({
      error: 'Ошибка при получении списка тарифов',
      message: error.message,
    });
  }
});

/**
 * POST /api/delivery/orders
 * Создание заказа
 * 
 * Body:
 * {
 *   "type": 1,
 *   "number": "ORDER-12345",
 *   "tariffCode": 751,
 *   "shipmentPoint": "MSK123",
 *   "toLocation": {
 *     "code": 270,
 *     "address": "г. Новосибирск, ул. Ленина, д. 1"
 *   },
 *   "recipient": {
 *     "name": "Иван Иванов",
 *     "phones": ["+79991234567"]
 *   },
 *   "packages": [
 *     {
 *       "number": "PACK-1",
 *       "weight": 50000,
 *       "length": 50,
 *       "width": 50,
 *       "height": 50,
 *       "items": [
 *         {
 *           "name": "Товар",
 *           "ware_key": "SKU-123",
 *           "cost": 10000,
 *           "amount": 1,
 *           "weight": 50000
 *         }
 *       ]
 *     }
 *   ]
 * }
 */
router.post('/orders', async (req, res) => {
  try {
    const {
      type = 1,
      number,
      tariffCode,
      shipmentPoint,
      deliveryPoint,
      toLocation,
      recipient,
      packages,
    } = req.body;

    // Валидация обязательных полей
    const errors = [];
    if (!number) errors.push('number обязателен');
    if (!tariffCode) errors.push('tariffCode обязателен');
    if (!recipient || !recipient.name) errors.push('recipient.name обязателен');
    if (!packages || packages.length === 0) errors.push('packages обязателен');
    if (!shipmentPoint && !deliveryPoint && !toLocation) {
      errors.push('Необходимо указать shipmentPoint и (deliveryPoint или toLocation)');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: 'Ошибка валидации',
        details: errors,
      });
    }

    // Создание заказа
    const result = await cdekClient.createOrder({
      type,
      number,
      tariffCode,
      shipmentPoint,
      deliveryPoint,
      toLocation,
      recipient,
      packages,
    });

    res.status(202).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Ошибка при создании заказа:', error);
    res.status(500).json({
      error: 'Ошибка при создании заказа',
      message: error.message,
    });
  }
});

export default router;

