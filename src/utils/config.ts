import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default('24h'),
  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_SIGNING_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  DATADOG_API_KEY: z.string().optional(),
  DATADOG_APP_KEY: z.string().optional(),
  AWS_WEBHOOK_URL: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

export type Config = z.infer<typeof envSchema>;

let config: Config;

export function getConfig(): Config {
  if (!config) {
    config = envSchema.parse(process.env);
  }
  return config;
}
