// const nodemailer = require('nodemailer');

// const createTransporter = () => {
//   const {
//     SMTP_HOST,
//     SMTP_PORT,
//     SMTP_USER,
//     SMTP_PASS,
//     SMTP_SECURE
//   } = process.env;

//   if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
//     throw new Error('SMTP configuration is incomplete.');
//   }

//   return nodemailer.createTransport({
//     host: SMTP_HOST,
//     port: Number(SMTP_PORT),
//     secure: SMTP_SECURE === 'true',
//     auth: {
//       user: SMTP_USER,
//       pass: SMTP_PASS
//     }
//   });
// };

// const sendOtpEmail = async (email, otp) => {
//   const transporter = createTransporter();

//   await transporter.sendMail({
//     from: process.env.SMTP_FROM || process.env.SMTP_USER,
//     to: email,
//     subject: 'Password Reset OTP',

//     text: `Your password reset OTP is ${otp}. It expires in 5 minutes. If you did not request this, please ignore this email.`,

//     html: `
//       <div style="font-family: Arial, sans-serif; padding: 20px;">
//         <h2>Password Reset Request</h2>

//         <p>We received a request to reset your password.</p>

//         <p>Your OTP is:</p>

//         <h1 style="letter-spacing: 8px; color: #2563eb;">
//           ${otp}
//         </h1>

//         <p>This OTP expires in 5 minutes.</p>

//         <p>If you did not request this password reset, please ignore this email.</p>
//       </div>
//     `
//   });
// };

// module.exports = {
//   sendOtpEmail
// };




// FOR TERMINAL TESTING

const sendOtpEmail = async (email, otp) => {
  console.log('\n======================================');
  console.log('       PASSWORD RESET OTP');
  console.log('======================================');
  console.log(`Employee Email : ${email}`);
  console.log(`OTP            : ${otp}`);
  console.log('Expires In     : 5 minutes');
  console.log('======================================\n');

  return true;
};

module.exports = {
  sendOtpEmail
};
