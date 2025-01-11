import { serve } from "@hono/node-server";
import { PrismaClient } from "@prisma/client";
import * as dotenv from "dotenv";
import { Hono } from "hono";
import { validator } from "hono/validator";

dotenv.config({ path: ".env" });
const port = 80;

const prisma = new PrismaClient();

async function getPosts() {
  try {
    const posts = await prisma.$transaction(
      async (transaction) => await transaction.post.findMany()
    );
    return posts;
  } catch (error) {
    console.error({
      message: "Failed to get posts",
      error,
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function createPost(title: string) {
  try {
    const post = await prisma.$transaction(
      async (transaction) =>
        await transaction.post.create({
          data: {
            title,
          },
        })
    );
    return post;
  } catch (error) {
    console.error({
      message: "Failed to create post",
      error,
    });
  } finally {
    await prisma.$disconnect();
  }
}

const app = new Hono();

app.get("/", (c) => {
  return c.text("Hello World");
});

app.get("/health", (c) => {
  c.status(200);
  return c.text("Success connect to server.");
});

app.get("/posts", async (c) => {
  const posts = await getPosts();
  c.status(200);
  return c.json(posts);
});

app.post(
  "/posts",
  validator("json", (value, c) => {
    const title = value.title;
    if (!title || typeof title !== "string") {
      return c.text("Invalid!", 400);
    }
    return {
      title,
    };
  }),
  async (c) => {
    const { title } = await c.req.valid("json");
    const post = await createPost(title);
    c.status(201);
    return c.json(post);
  }
);

serve({
  fetch: app.fetch,
  port,
});

console.log(`🚀  Server ready at port: ${port}`);
