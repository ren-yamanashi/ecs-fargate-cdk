import { Hono } from "hono";
import { serve } from "@hono/node-server";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { validator } from "hono/validator";

dotenv.config({ path: ".env" });
const port = 80;

const prisma = new PrismaClient();

async function getPosts() {
  try {
    const posts = await prisma.post.findMany();
    return posts;
  }
  catch (error) {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
  finally {
    await prisma.$disconnect();
  }
}

async function createPost(title: string) {
  try {
    const post = await prisma.post.create({
      data: {
        title,
      },
    });
    return post;
  }
  catch (error) {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
  finally {
    await prisma.$disconnect();
  }
}

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello World");
});

app.get("/posts", async (c) => {
  const posts = await getPosts();
  c.status(200);
  return c.json(posts);
});

app.post("/posts", validator("json", (value, c) => {
  const title = value.title;
  if (!title || typeof title !== "string") {
    return c.text("Invalid!", 400);
  }
  return {
    title,
  };
}), async (c) => {
  const { title } = await c.req.valid("json");
  const post = await createPost(title);
  c.status(201);
  return c.json(post);
});

serve({
  fetch: app.fetch,
  port,
});

// eslint-disable-next-line no-console
console.log(`🚀  Server ready at ${process.env.API_URL}:${port}/`);
