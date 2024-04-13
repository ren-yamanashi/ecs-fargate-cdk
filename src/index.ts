import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
const app = new Hono();
const port = 80;

app.get("/",  (c) => {
  return c.text("Hello World");
})

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀  Server ready at ${process.env.API_URL}:${port}/`);