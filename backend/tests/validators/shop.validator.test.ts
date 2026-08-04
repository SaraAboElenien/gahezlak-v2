import { describe, it, expect } from "vitest";
import express, { Request, Response } from "express";
import request from "supertest";
import { creatShopValidator } from "../../validators/shop.validator";
import { ErrorHandlerMiddleware } from "../../middlewares/error-handling.middleware";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.post("/shops", creatShopValidator, (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  app.use(ErrorHandlerMiddleware);
  return app;
}

const validPayload = {
  name: "Test Bistro",
  type: "restaurant",
  address: { country: "EG", city: "Cairo", street: "1 Test St" },
  phoneNumber: "01012345678",
  email: "shop@example.com",
};

describe("creatShopValidator", () => {
  it("passes through a fully valid payload", async () => {
    const res = await request(buildApp()).post("/shops").send(validPayload);
    expect(res.status).toBe(200);
  });

  it("rejects a shop name shorter than 3 characters", async () => {
    const res = await request(buildApp())
      .post("/shops")
      .send({ ...validPayload, name: "ab" });
    expect(res.status).toBe(422);
  });

  it("rejects a missing address", async () => {
    const { address, ...rest } = validPayload;
    const res = await request(buildApp()).post("/shops").send(rest);
    expect(res.status).toBe(422);
  });

  it("rejects a non-Egyptian-shaped phone number", async () => {
    const res = await request(buildApp())
      .post("/shops")
      .send({ ...validPayload, phoneNumber: "+1-202-555-0104" });
    expect(res.status).toBe(422);
  });
});
