/**
 * Модуль авторизации в CDEK API
 * Управляет получением и кэшированием токена доступа
 */

class CDEKAuth {
  constructor(apiUrl, account, securePassword) {
    if (!apiUrl) {
      throw new Error('CDEK_API_URL не задан. Проверьте файл .env');
    }
    if (!account) {
      throw new Error('CDEK_ACCOUNT не задан. Проверьте файл .env');
    }
    if (!securePassword) {
      throw new Error('CDEK_SECURE_PASSWORD не задан. Проверьте файл .env');
    }
    
    this.apiUrl = apiUrl;
    this.account = account;
    this.securePassword = securePassword;
    this.token = null;
    this.tokenExpiresAt = null;
  }

  /**
   * Получение токена авторизации
   * @returns {Promise<string>} Токен доступа
   */
  async getToken() {
    // Проверяем, есть ли валидный токен в кэше
    if (this.token && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.token;
    }

    // Получаем новый токен
    try {
      const response = await fetch(`${this.apiUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.account,
          client_secret: this.securePassword,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ошибка авторизации: ${response.status} ${errorText}`);
      }

      const data = await response.json();

      // Сохраняем токен и время истечения (с запасом 60 секунд)
      this.token = data.access_token;
      const expiresIn = (data.expires_in || 3600) * 1000; // конвертируем в миллисекунды
      this.tokenExpiresAt = Date.now() + expiresIn - 60000; // минус 1 минута запаса

      console.log('Токен CDEK получен, действителен до:', new Date(this.tokenExpiresAt).toISOString());
      return this.token;
    } catch (error) {
      console.error('Ошибка при получении токена CDEK:', error);
      throw error;
    }
  }

  /**
   * Сброс токена (для принудительного обновления)
   */
  resetToken() {
    this.token = null;
    this.tokenExpiresAt = null;
  }
}

export default CDEKAuth;

