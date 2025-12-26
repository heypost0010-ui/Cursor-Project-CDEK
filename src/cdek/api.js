/**
 * Клиент для работы с CDEK API
 */

import CDEKAuth from './auth.js';

class CDEKApiClient {
  constructor(apiUrl, account, securePassword) {
    this.apiUrl = apiUrl;
    this.auth = new CDEKAuth(apiUrl, account, securePassword);
  }

  /**
   * Выполнение запроса к CDEK API с автоматической авторизацией
   * @param {string} endpoint - Эндпоинт API (например, '/v2/location/cities')
   * @param {object} options - Опции запроса (method, body, headers)
   * @returns {Promise<object>} Ответ от API
   */
  async request(endpoint, options = {}) {
    const token = await this.auth.getToken();

    const url = endpoint.startsWith('http') ? endpoint : `${this.apiUrl}${endpoint}`;
    
    // Извлекаем body из options, чтобы правильно его обработать
    const { body, ...restOptions } = options;
    
    const defaultOptions = {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...restOptions.headers,
      },
    };

    // Преобразуем body в JSON строку, если он есть
    if (body) {
      defaultOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      ...defaultOptions,
      ...restOptions,
      headers: {
        ...defaultOptions.headers,
        ...restOptions.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      // Детальное логирование ошибки для отладки
      console.error('CDEK API Error Details:', JSON.stringify({
        status: response.status,
        statusText: response.statusText,
        url: url,
        error: errorData,
      }, null, 2));
      throw new Error(`CDEK API Error (${response.status}): ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  }

  /**
   * Поиск городов по названию
   * @param {string} cityName - Название города
   * @param {string} countryCode - Код страны (по умолчанию 'RU')
   * @param {number} size - Ограничение выборки
   * @returns {Promise<Array>} Массив городов
   */
  async searchCities(cityName, countryCode = 'RU', size = 10) {
    const params = new URLSearchParams({
      name: cityName,
      country_code: countryCode,
      size: size.toString(),
      lang: 'rus',
    });

    return await this.request(`/location/cities?${params.toString()}`);
  }

  /**
   * Получение списка офисов (ПВЗ) в городе
   * @param {number} cityCode - Код города СДЭК
   * @param {object} filters - Дополнительные фильтры
   * @returns {Promise<Array>} Массив офисов
   */
  async getOffices(cityCode, filters = {}) {
    const params = new URLSearchParams({
      city_code: cityCode.toString(),
      lang: 'rus',
      ...Object.fromEntries(
        Object.entries(filters).map(([key, value]) => [key, value.toString()])
      ),
    });

    return await this.request(`/deliverypoints?${params.toString()}`);
  }

  /**
   * Расчет стоимости доставки по всем доступным тарифам
   * @param {object} params - Параметры расчета
   * @param {object} params.fromLocation - Локация отправления {code, address}
   * @param {object} params.toLocation - Локация получения {code, address}
   * @param {Array} params.packages - Массив посылок [{weight, length, width, height}]
   * @param {string} params.date - Дата отправки (ISO 8601)
   * @returns {Promise<object>} Результат расчета
   */
  async calculateDelivery(params) {
    const {
      fromLocation,
      toLocation,
      packages,
      date,
      type,
      currency,
      lang,
      additional_order_types,
    } = params;

    // ВАЖНО: Согласно ответу поддержки CDEK, code должен быть СТРОКОЙ, а не числом!
    // Минимальный запрос содержит только обязательные поля:
    // - from_location.code (строка)
    // - to_location.code (строка)
    // - packages (массив с weight, length, width, height)

    // Формируем локации: code обязателен и должен быть СТРОКОЙ
    // Согласно примеру поддержки, address НЕ используется в минимальном запросе
    const from_location = {
      code: String(fromLocation.code), // ВАЖНО: строка, не число!
    };
    // ВАЖНО: В минимальном запросе address НЕ передаем (как в примере поддержки)
    // Раскомментируйте, если нужно передавать address:
    // if (fromLocation.address && typeof fromLocation.address === 'string' && fromLocation.address.trim()) {
    //   from_location.address = fromLocation.address.trim();
    // }

    const to_location = {
      code: String(toLocation.code), // ВАЖНО: строка, не число!
    };
    // ВАЖНО: В минимальном запросе address НЕ передаем (как в примере поддержки)
    // Раскомментируйте, если нужно передавать address:
    // if (toLocation.address && typeof toLocation.address === 'string' && toLocation.address.trim()) {
    //   to_location.address = toLocation.address.trim();
    // }

    // Формируем посылки с проверкой типов
    const packagesArray = packages.map(pkg => {
      const weight = Number(pkg.weight);
      const length = Number(pkg.length);
      const width = Number(pkg.width);
      const height = Number(pkg.height);
      
      if (isNaN(weight) || isNaN(length) || isNaN(width) || isNaN(height)) {
        throw new Error('Неверные числовые значения в параметрах посылки');
      }
      
      return {
        weight: weight,   // в граммах
        length: length,   // в см
        width: width,     // в см
        height: height,   // в см
      };
    });

    if (packagesArray.length === 0) {
      throw new Error('packages должен быть непустым массивом');
    }

    // Создаем минимальный body ТОЧНО как в примере поддержки CDEK
    // Только обязательные поля: from_location, to_location, packages
    const body = {
      from_location,
      to_location,
      packages: packagesArray,
    };

    // ВАЖНО: Согласно примеру поддержки, минимальный запрос содержит ТОЛЬКО эти три поля
    // Опциональные поля добавляем только если они явно указаны и нужны
    // Но для начала используем минимальный запрос без них
    
    // Очищаем body от undefined значений (на всякий случай)
    const cleanBody = JSON.parse(JSON.stringify(body));

    // Логирование для отладки (можно отключить в production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('CDEK API Request:', JSON.stringify(cleanBody, null, 2));
    }

    return await this.request('/calculator/tarifflist', {
      method: 'POST',
      body: cleanBody,
    });
  }

  /**
   * Расчет стоимости доставки по конкретному тарифу
   * @param {object} params - Параметры расчета
   * @param {number} params.tariffCode - Код тарифа
   * @param {object} params.fromLocation - Локация отправления
   * @param {object} params.toLocation - Локация получения
   * @param {Array} params.packages - Массив посылок
   * @param {Array} params.services - Дополнительные услуги
   * @returns {Promise<object>} Результат расчета
   */
  async calculateDeliveryByTariff(params) {
    const {
      tariffCode,
      fromLocation,
      toLocation,
      packages,
      services = [],
      date,
      currency = 1,
      shipmentPoint, // Код ПВЗ отправления (для тарифа 751)
      deliveryPoint, // Код ПВЗ доставки (для тарифа 751)
    } = params;

    // Форматируем дату так же, как в calculateDelivery
    let formattedDate = date;
    if (!formattedDate) {
      const now = new Date();
      const timezoneOffset = -now.getTimezoneOffset();
      const hours = Math.floor(Math.abs(timezoneOffset) / 60).toString().padStart(2, '0');
      const minutes = (Math.abs(timezoneOffset) % 60).toString().padStart(2, '0');
      const sign = timezoneOffset >= 0 ? '+' : '-';
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hour = String(now.getHours()).padStart(2, '0');
      const minute = String(now.getMinutes()).padStart(2, '0');
      const second = String(now.getSeconds()).padStart(2, '0');
      formattedDate = `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${hours}${minutes}`;
    } else {
      formattedDate = formattedDate.replace(/\.\d{3}/, '');
    }

    // ВАЖНО: Согласно ответу поддержки CDEK, code должен быть СТРОКОЙ, а не числом!
    const from_location = {
      code: String(fromLocation.code), // ВАЖНО: строка, не число!
    };
    if (fromLocation.address && typeof fromLocation.address === 'string' && fromLocation.address.trim()) {
      from_location.address = fromLocation.address.trim();
    }

    const to_location = {
      code: String(toLocation.code), // ВАЖНО: строка, не число!
    };
    if (toLocation.address && typeof toLocation.address === 'string' && toLocation.address.trim()) {
      to_location.address = toLocation.address.trim();
    }

    const body = {
      tariff_code: Number(tariffCode),
      date: formattedDate,
      currency: Number(currency),
      lang: 'rus',
      from_location,
      to_location,
      packages: packages.map(pkg => {
        const weight = Number(pkg.weight);
        const length = Number(pkg.length);
        const width = Number(pkg.width);
        const height = Number(pkg.height);
        
        if (isNaN(weight) || isNaN(length) || isNaN(width) || isNaN(height)) {
          throw new Error('Неверные числовые значения в параметрах посылки');
        }
        
        return {
          weight: weight,
          length: length,
          width: width,
          height: height,
        };
      }),
    };

    // Добавляем services только если они есть
    if (services && services.length > 0) {
      body.services = services.map(svc => ({
        code: svc.code,
        parameter: svc.parameter,
      }));
    }

    // Для тарифа 751 (склад-склад) добавляем shipment_point и delivery_point
    if (shipmentPoint) {
      body.shipment_point = String(shipmentPoint);
    }
    if (deliveryPoint) {
      body.delivery_point = String(deliveryPoint);
    }

    // Удаляем undefined поля
    const cleanBody = JSON.parse(JSON.stringify(body));

    console.log('CDEK API Request (by tariff):', JSON.stringify(cleanBody, null, 2));

    return await this.request('/calculator/tariff', {
      method: 'POST',
      body: cleanBody,
    });
  }

  /**
   * Получение списка доступных тарифов
   * Примечание: Эндпоинт /calculator/tariffs недоступен в тестовом API.
   * Используем альтернативный подход - получаем тарифы через расчет с минимальными параметрами.
   * @param {string} lang - Язык ответа ('rus', 'eng', 'zho'), по умолчанию 'rus'
   * @param {object} options - Опциональные параметры для расчета
   * @param {number} options.fromCityCode - Код города отправления (по умолчанию 44 - Москва)
   * @param {number} options.toCityCode - Код города получения (по умолчанию 270 - Новосибирск)
   * @returns {Promise<Array>} Массив доступных тарифов с описаниями
   */
  async getTariffs(lang = 'rus', options = {}) {
    // Пробуем сначала прямой эндпоинт (может быть доступен в продакшн API)
    try {
      return await this.request('/calculator/tariffs', {
        method: 'GET',
        headers: {
          'X-User-Lang': lang,
        },
      });
    } catch (error) {
      // Если эндпоинт недоступен (404), используем альтернативный подход
      // Проверяем, что это именно 404 ошибка
      if (error.message && error.message.includes('404')) {
        console.log('Эндпоинт /calculator/tariffs недоступен, используем альтернативный метод');
        
        // Получаем список тарифов через расчет стоимости с минимальными параметрами
        const fromCityCode = options.fromCityCode || 44; // Москва
        const toCityCode = options.toCityCode || 270; // Новосибирск
        
        const result = await this.calculateDelivery({
          fromLocation: { code: fromCityCode },
          toLocation: { code: toCityCode },
          packages: [{
            weight: 1000, // 1 кг
            length: 10,
            width: 10,
            height: 10,
          }],
        });

        // Извлекаем уникальные тарифы из результата
        const tariffs = result.tariff_codes || [];
        
        // Форматируем результат в единый формат
        return tariffs.map(tariff => ({
          tariff_code: tariff.tariff_code,
          tariff_name: tariff.tariff_name,
          tariff_description: tariff.tariff_description || '',
          delivery_mode: tariff.delivery_mode,
        }));
      } else {
        // Если это не 404, пробрасываем ошибку дальше
        throw error;
      }
    }
  }

  /**
   * Создание заказа
   * @param {object} params - Параметры заказа
   * @param {number} params.type - Тип заказа (1 - интернет-магазин, 2 - доставка)
   * @param {string} params.number - Номер заказа
   * @param {number} params.tariffCode - Код тарифа
   * @param {string} params.shipmentPoint - Код ПВЗ отправления (опционально)
   * @param {string} params.deliveryPoint - Код ПВЗ доставки (опционально, если указан toLocation - не используется)
   * @param {object} params.toLocation - Локация доставки {code, address} (опционально, альтернатива deliveryPoint)
   * @param {object} params.recipient - Получатель {name, phones}
   * @param {Array} params.packages - Массив посылок
   * @returns {Promise<object>} Результат создания заказа
   */
  async createOrder(params) {
    const {
      type = 1,
      number,
      tariffCode,
      shipmentPoint,
      deliveryPoint,
      toLocation,
      recipient,
      packages,
    } = params;

    if (!number) {
      throw new Error('Номер заказа обязателен');
    }
    if (!tariffCode) {
      throw new Error('Код тарифа обязателен');
    }
    if (!recipient || !recipient.name) {
      throw new Error('Получатель обязателен');
    }
    if (!packages || packages.length === 0) {
      throw new Error('Посылки обязательны');
    }

    const body = {
      type: Number(type),
      number: String(number),
      tariff_code: Number(tariffCode),
      recipient: {
        name: String(recipient.name),
        phones: Array.isArray(recipient.phones) 
          ? recipient.phones.map(phone => ({
              number: String(phone.number || phone),
            }))
          : [{ number: String(recipient.phones) }],
      },
      packages: packages.map((pkg, index) => ({
        number: pkg.number || `PACK-${index + 1}`,
        weight: Number(pkg.weight),
        length: Number(pkg.length),
        width: Number(pkg.width),
        height: Number(pkg.height),
        items: pkg.items || [],
      })),
    };

    // shipment_point - код ПВЗ отправления (опционально)
    if (shipmentPoint) {
      body.shipment_point = String(shipmentPoint);
    }

    // delivery_point или to_location - для доставки
    if (deliveryPoint) {
      // Доставка до ПВЗ
      body.delivery_point = String(deliveryPoint);
    } else if (toLocation) {
      // Доставка до адреса (до двери)
      body.to_location = {
        code: String(toLocation.code),
      };
      if (toLocation.address) {
        body.to_location.address = String(toLocation.address);
      }
    } else {
      throw new Error('Необходимо указать либо deliveryPoint, либо toLocation');
    }

    console.log('CDEK API Create Order Request:', JSON.stringify(body, null, 2));

    return await this.request('/orders', {
      method: 'POST',
      body: body,
    });
  }
}

export default CDEKApiClient;

