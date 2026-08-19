import app from './app.js';
import env from './config/env.js';
import paymentsService from './services/payments.service.js';

const PORT = env.port || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${env.nodeEnv} mode on port ${PORT}`);
  paymentsService.registerPaymentMethodDomains();
});
