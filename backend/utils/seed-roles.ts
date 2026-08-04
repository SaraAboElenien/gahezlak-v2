import mongoose from "mongoose";
import { Roles, Role } from "../models/Role";
import { connectDB } from "../config/db";

async function seedRoles() {
  await connectDB();
  for (const role of Object.values(Role)) {
    const exists = await Roles.findOne({ name: role });
    if (!exists) {
      await Roles.create({ name: role });
      console.log(`Seeded role: ${role}`);
    } else {
      console.log(`Role already exists: ${role}`);
    }
  }
  mongoose.connection.close();
}

seedRoles().catch((err) => {
  console.error("Error seeding roles:", err);
  mongoose.connection.close();
});
