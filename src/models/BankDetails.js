import mongoose from 'mongoose';

const BankDetailsSchema = new mongoose.Schema({
  bankName: String,
  accountType: String,
  accountNumber: String,
  routingNumberOrIfsc: String,
  isVerified: Boolean
}, { timestamps: true });

export const BankDetails = mongoose.model('BankDetails', BankDetailsSchema);
