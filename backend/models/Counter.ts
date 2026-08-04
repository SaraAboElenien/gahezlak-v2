import mongoose, { Schema } from "mongoose";
import { collectionsName } from "../common/collections-name";

export interface ICounter {
  _id: string;
  sequence_value: number;
}

const CounterSchema = new Schema<ICounter>(
  {
    _id: {
      type: String,
      required: true,
    },
    sequence_value: {
      type: Number,
      default: 1,
    },
  },
  {
    collection: collectionsName.COUNTERS,
    timestamps: false,
  },
);

export const Counters = mongoose.model<ICounter>(
  collectionsName.COUNTERS,
  CounterSchema,
);
