/**
 * Тестирование расчета стоимости доставки сборного груза
 * Тесты: до ПВЗ (751) и до двери (750)
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000/api/delivery';
const TEST_DATA_FILE = './test-groupage-delivery-data.json';

// Загружаем тестовые данные
const testData = JSON.parse(readFileSync(TEST_DATA_FILE, 'utf-8'));

// Цвета для консоли
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

function logTest(testName) {
  console.log('\n' + '-'.repeat(60));
  log(`Тест: ${testName}`, 'cyan');
  console.log('-'.repeat(60));
}

async function checkServer() {
  try {
    const response = await fetch('http://localhost:3000/');
    if (response.ok) {
      log('✓ Сервер доступен', 'green');
      return true;
    }
  } catch (error) {
    log('✗ Сервер недоступен', 'red');
    log(`Ошибка: ${error.message}`, 'red');
    log('\nУбедитесь, что сервер запущен: npm start', 'yellow');
    return false;
  }
}

async function testCalculation(testConfig, shipment) {
  const {
    name,
    toCityCode,
    toCityName,
    tariffCode,
    deliveryPoint,
    toAddress,
    expectedBehavior,
  } = testConfig;

  logTest(name);
  log(`Маршрут: ${shipment.fromCityName} (${shipment.fromCityCode}) → ${toCityName} (${toCityCode})`, 'blue');
  log(`Тариф: ${tariffCode}`, 'blue');
  log(`Ожидаемое поведение: ${expectedBehavior}`, 'yellow');

  const requestBody = {
    tariffCode: tariffCode,
    fromCityCode: shipment.fromCityCode,
    fromAddress: shipment.fromAddress,
    toCityCode: toCityCode,
    weight: shipment.weight,
    length: shipment.length,
    width: shipment.width,
    height: shipment.height,
  };

  // Добавляем опциональные параметры
  if (toAddress) {
    requestBody.toAddress = toAddress;
    log(`Адрес доставки: ${toAddress}`, 'blue');
  }

  if (deliveryPoint) {
    requestBody.deliveryPoint = deliveryPoint;
    log(`ПВЗ доставки: ${deliveryPoint}`, 'blue');
  }

  if (shipment.shipmentPoint) {
    requestBody.shipmentPoint = shipment.shipmentPoint;
    log(`ПВЗ отправления: ${shipment.shipmentPoint}`, 'blue');
  }

  console.log('\nЗапрос:');
  console.log(JSON.stringify(requestBody, null, 2));

  try {
    const startTime = Date.now();
    const response = await fetch(`${API_BASE_URL}/calculate-by-tariff`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    console.log(`\nСтатус: ${response.status} (${duration}ms)`);

    if (response.ok && data.success) {
      log('\n✓ Успешно!', 'green');
      console.log('\nРезультат:');
      console.log(JSON.stringify({
        tariffCode: data.tariffCode,
        deliveryCost: data.deliveryCost,
        totalCost: data.totalCost,
        periodMin: data.periodMin,
        periodMax: data.periodMax,
        currency: data.currency,
        deliveryDateRange: data.deliveryDateRange,
      }, null, 2));

      if (data.deliveryCost) {
        log(`\n💰 Стоимость доставки: ${data.deliveryCost} ${data.currency || 'RUB'}`, 'green');
        log(`📅 Срок доставки: ${data.periodMin}-${data.periodMax} дней`, 'green');
        if (data.deliveryDateRange) {
          log(`📆 Даты: ${data.deliveryDateRange.dateMin} - ${data.deliveryDateRange.dateMax}`, 'green');
        }
      }

      return { success: true, data };
    } else {
      log('\n✗ Ошибка!', 'red');
      console.log('\nОтвет сервера:');
      console.log(JSON.stringify(data, null, 2));
      return { success: false, error: data };
    }
  } catch (error) {
    log('\n✗ Исключение!', 'red');
    log(`Ошибка: ${error.message}`, 'red');
    console.error(error);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  logSection('ТЕСТИРОВАНИЕ РАСЧЕТА СТОИМОСТИ ДОСТАВКИ СБОРНОГО ГРУЗА');

  // Проверка сервера
  log('\n1. Проверка доступности сервера...', 'bright');
  const serverAvailable = await checkServer();
  if (!serverAvailable) {
    process.exit(1);
  }

  // Параметры отправления
  const shipment = testData.testData.shipment;
  log('\n2. Параметры отправления:', 'bright');
  console.log(JSON.stringify(shipment, null, 2));

  // Результаты тестов
  const results = [];

  // Тест 1: Доставка до ПВЗ (автоматический поиск)
  logSection('ТЕСТ 1: Доставка до ПВЗ (автоматический поиск ПВЗ)');
  const result1 = await testCalculation(
    testData.testData.delivery.test1_pvz,
    shipment
  );
  results.push({ test: 'test1_pvz', ...result1 });

  // Тест 2: Доставка до двери
  logSection('ТЕСТ 2: Доставка до двери');
  const result2 = await testCalculation(
    testData.testData.delivery.test2_door,
    shipment
  );
  results.push({ test: 'test2_door', ...result2 });

  // Тест 3: Доставка до ПВЗ (явное указание)
  logSection('ТЕСТ 3: Доставка до ПВЗ (явное указание ПВЗ)');
  const result3 = await testCalculation(
    testData.testData.delivery.test3_pvz_explicit,
    shipment
  );
  results.push({ test: 'test3_pvz_explicit', ...result3 });

  // Итоговая сводка
  logSection('ИТОГОВАЯ СВОДКА');
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log('\nРезультаты тестов:');
  results.forEach((result, index) => {
    const testName = testData.testData.delivery[result.test]?.name || result.test;
    const status = result.success ? '✓ УСПЕШНО' : '✗ ОШИБКА';
    const color = result.success ? 'green' : 'red';
    log(`  ${index + 1}. ${testName}: ${status}`, color);
    
    if (result.success && result.data?.deliveryCost) {
      log(`     Стоимость: ${result.data.deliveryCost} ${result.data.currency || 'RUB'}`, 'blue');
    }
    if (!result.success) {
      log(`     Ошибка: ${result.error?.message || JSON.stringify(result.error)}`, 'red');
    }
  });

  console.log('\n' + '='.repeat(60));
  log(`Всего тестов: ${results.length}`, 'bright');
  log(`Успешно: ${successCount}`, 'green');
  log(`Ошибок: ${failCount}`, failCount > 0 ? 'red' : 'green');
  console.log('='.repeat(60) + '\n');

  // Детальное сравнение результатов
  if (successCount > 1) {
    logSection('СРАВНЕНИЕ РЕЗУЛЬТАТОВ');
    const successfulResults = results.filter(r => r.success && r.data);
    
    if (successfulResults.length > 1) {
      console.log('\nСравнение стоимости доставки:');
      successfulResults.forEach((result, index) => {
        const testName = testData.testData.delivery[result.test]?.name || result.test;
        const cost = result.data.deliveryCost;
        const period = `${result.data.periodMin}-${result.data.periodMax}`;
        log(`  ${testName}:`, 'cyan');
        log(`    Стоимость: ${cost} ${result.data.currency || 'RUB'}`, 'blue');
        log(`    Срок: ${period} дней`, 'blue');
      });
    }
  }
}

// Запуск тестов
runTests().catch(error => {
  log('\n✗ Критическая ошибка при выполнении тестов', 'red');
  console.error(error);
  process.exit(1);
});

