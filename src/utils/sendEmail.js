const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ✅ OTP-specific function (matches your route)
const sendOTP = async (to, otp) => {
  await transporter.sendMail({
    from: `Meal App <${process.env.EMAIL_USER}>`,
    to,
    subject: "Your OTP Code",
    text: `Your OTP is ${otp}`,
  });
};

module.exports = { sendOTP };