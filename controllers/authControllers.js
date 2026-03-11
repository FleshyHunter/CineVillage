// controllers/authController.js
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const {
    initDBIfNecessary,
    getCollectionAdmin,
    getCollectionManager,
    getCollectionStaff
} = require("../config/database");

const PASSWORD_BCRYPT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
const RESET_TOKEN_BYTES = 32;
const MAIL_TIMEOUT_MS = 8000;

let cachedMailer = null;

function hashResetToken(rawToken) {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
}

async function withTimeout(promise, ms, label) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
}

async function getMailer() {
    if (cachedMailer) return cachedMailer;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        cachedMailer = {
            transporter: nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT || 587),
                secure: String(process.env.SMTP_SECURE || "false") === "true",
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            }),
            fromAddress: process.env.SMTP_FROM || process.env.SMTP_USER,
            isEthereal: false
        };
        return cachedMailer;
    }

    const testAccount = await withTimeout(
        nodemailer.createTestAccount(),
        MAIL_TIMEOUT_MS,
        "createTestAccount"
    );
    cachedMailer = {
        transporter: nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        }),
        fromAddress: `"CineVillage" <${testAccount.user}>`,
        isEthereal: true
    };
    return cachedMailer;
}

async function findAccountByEmail(email) {
    const normalizedEmail = (email || "").toString().trim();
    if (!normalizedEmail) return null;

    const collectionAdmin = getCollectionAdmin();
    const collectionManager = getCollectionManager();
    const collectionStaff = getCollectionStaff();

    const admin = await collectionAdmin.findOne({ email: normalizedEmail });
    if (admin) return { role: "Admin", account: admin, collection: collectionAdmin };

    const manager = await collectionManager.findOne({ email: normalizedEmail });
    if (manager) return { role: "Manager", account: manager, collection: collectionManager };

    const staff = await collectionStaff.findOne({ email: normalizedEmail });
    if (staff) return { role: "Staff", account: staff, collection: collectionStaff };

    return null;
}

async function findAccountByResetToken(rawToken) {
    if (!rawToken) return null;
    const tokenHash = hashResetToken(rawToken);
    const now = new Date();

    const collectionAdmin = getCollectionAdmin();
    const collectionManager = getCollectionManager();
    const collectionStaff = getCollectionStaff();

    const admin = await collectionAdmin.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: now }
    });
    if (admin) return { role: "Admin", account: admin, collection: collectionAdmin };

    const manager = await collectionManager.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: now }
    });
    if (manager) return { role: "Manager", account: manager, collection: collectionManager };

    const staff = await collectionStaff.findOne({
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: now }
    });
    if (staff) return { role: "Staff", account: staff, collection: collectionStaff };

    return null;
}

async function loginAccount(email, password) {
    await initDBIfNecessary();

    const normalizedEmail = (email || "").toString().trim();
    if (!normalizedEmail || !password) {
        console.log("[AUTH] Login failed: missing email or password", { email: normalizedEmail || "(empty)" });
        return { error: "Invalid email or password" };
    }

    const collectionAdmin = getCollectionAdmin();
    const collectionManager = getCollectionManager();
    const collectionStaff = getCollectionStaff();

    // Priority: Admin > Manager > Staff (if duplicate emails exist).
    const admin = await collectionAdmin.findOne({ email: normalizedEmail });
    const manager = admin ? null : await collectionManager.findOne({ email: normalizedEmail });
    const staff = (!admin && !manager) ? await collectionStaff.findOne({ email: normalizedEmail }) : null;

    const account = admin || manager || staff;
    if (!account) {
        console.log("[AUTH] Login failed: email not found", { email: normalizedEmail });
        return { error: "Invalid email or password" };
    }
    if (!account.password) {
        console.log("[AUTH] Login failed: account missing password hash", {
            email: normalizedEmail,
            accountId: account._id?.toString()
        });
        return { error: "Invalid email or password" };
    }

    const match = await bcrypt.compare(password, account.password);
    if (!match) {
        console.log("[AUTH] Login failed: password mismatch", {
            email: normalizedEmail,
            accountId: account._id?.toString()
        });
        return { error: "Invalid email or password" };
    }

    const role = admin ? "Admin" : manager ? "Manager" : "Staff";
    if ((role === "Manager" || role === "Staff") && account.status === "Inactive") {
        console.log("[AUTH] Login blocked: inactive account", {
            email: normalizedEmail,
            role,
            accountId: account._id?.toString()
        });
        return { error: "Account is inactive. Please contact administrator." };
    }

    console.log("[AUTH] Login success", {
        email: normalizedEmail,
        role,
        accountId: account._id?.toString()
    });
    return { account, role };
}

async function requestPasswordReset(email, baseUrl) {
    await initDBIfNecessary();

    const normalizedEmail = (email || "").toString().trim();
    const found = await findAccountByEmail(normalizedEmail);
    if (!found) {
        console.log("[AUTH] Reset requested for non-existing email", { email: normalizedEmail || "(empty)" });
        return { sent: true };
    }

    const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString("hex");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await found.collection.updateOne(
        { _id: found.account._id },
        {
            $set: {
                passwordResetTokenHash: tokenHash,
                passwordResetExpiresAt: expiresAt,
                passwordResetRequestedAt: new Date()
            }
        }
    );

    const safeBaseUrl = (baseUrl || "").replace(/\/+$/, "");
    const resetLink = `${safeBaseUrl}/auth/reset/${rawToken}`;

    try {
        const { transporter, fromAddress, isEthereal } = await getMailer();
        const info = await withTimeout(
            transporter.sendMail({
            from: fromAddress,
            to: normalizedEmail,
            subject: "CineVillage Password Reset",
            text: `You requested a password reset.\n\nUse this link to reset your password:\n${resetLink}\n\nThis link expires in 15 minutes.`,
            html: `
                <p>You requested a password reset.</p>
                <p><a href="${resetLink}">Reset your password</a></p>
                <p>This link expires in 15 minutes.</p>
            `
            }),
            MAIL_TIMEOUT_MS,
            "sendMail"
        );

        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log("[AUTH] Reset email sent", {
            email: normalizedEmail,
            role: found.role,
            accountId: found.account._id?.toString(),
            previewUrl: previewUrl || "(none)",
            transport: isEthereal ? "ethereal" : "smtp"
        });

        return { sent: true, previewUrl: previewUrl || null };
    } catch (error) {
        console.error("[AUTH] Reset email send failed:", error.message);
        console.log("[AUTH] Dev fallback reset link", {
            email: normalizedEmail,
            accountId: found.account._id?.toString(),
            resetLink
        });
        // Keep token persisted so reset flow still works even if mail transport is unavailable.
        return { sent: true, fallback: true };
    }
}

async function validateResetToken(rawToken) {
    await initDBIfNecessary();
    const found = await findAccountByResetToken(rawToken);
    if (!found) return { valid: false };
    return { valid: true, role: found.role, accountId: found.account._id?.toString() };
}

async function resetPasswordWithToken(rawToken, newPassword) {
    await initDBIfNecessary();

    const found = await findAccountByResetToken(rawToken);
    if (!found) {
        return { error: "This reset link is invalid or has expired." };
    }

    const nextPassword = (newPassword || "").toString();
    if (!nextPassword) {
        return { error: "Password is required." };
    }

    const passwordHash = await bcrypt.hash(nextPassword, PASSWORD_BCRYPT_ROUNDS);
    await found.collection.updateOne(
        { _id: found.account._id },
        {
            $set: {
                password: passwordHash,
                updated: new Date()
            },
            $unset: {
                passwordResetTokenHash: "",
                passwordResetExpiresAt: "",
                passwordResetRequestedAt: ""
            }
        }
    );

    console.log("[AUTH] Password reset success", {
        role: found.role,
        accountId: found.account._id?.toString()
    });

    return { success: true };
}

module.exports = {
    loginAccount,
    requestPasswordReset,
    validateResetToken,
    resetPasswordWithToken
};
