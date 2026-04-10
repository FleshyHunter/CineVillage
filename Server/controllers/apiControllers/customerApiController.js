const bcrypt = require("bcrypt");
const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionCustomer
} = require("../../config/database");
const {
  signCustomerToken,
  setCustomerAuthCookie,
  clearCustomerAuthCookie
} = require("../../config/customerJwt");

const CUSTOMER_BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeText(value) {
  return (value || "").toString().trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeContact(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const hasPlusPrefix = raw.startsWith("+");
  const digitsOnly = raw.replace(/\D/g, "");
  if (!digitsOnly) return "";
  return hasPlusPrefix ? `+${digitsOnly}` : digitsOnly;
}

function normalizeAge(value) {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
}

function serializeCustomer(customer) {
  if (!customer) return null;

  const normalizedAge = normalizeAge(customer.age);

  return {
    id: customer._id?.toString(),
    name: normalizeText(customer.name),
    email: normalizeText(customer.email),
    contact: normalizeText(customer.contact),
    age: Number.isInteger(normalizedAge) ? normalizedAge : null,
    profilePic: normalizeText(customer.profilePic) || "/images/cameraplaceholder.jpg",
    status: normalizeText(customer.status || "active")
  };
}

async function registerCustomer(req, res) {
  try {
    await initDBIfNecessary();

    const name = normalizeText(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const contact = normalizeText(req.body?.contact);
    const contactNormalized = normalizeContact(contact);
    const age = normalizeAge(req.body?.age);
    const password = normalizeText(req.body?.password);

    if (!name || !email || !contact || !password) {
      return res.status(400).json({
        message: "Name, email, contact, and password are required."
      });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        message: "Please enter a valid email."
      });
    }

    if (!contactNormalized) {
      return res.status(400).json({
        message: "Please enter a valid contact number."
      });
    }

    if (req.body?.age !== undefined && req.body?.age !== null && String(req.body?.age).trim() !== "") {
      if (!Number.isInteger(age) || age < 0 || age > 120) {
        return res.status(400).json({
          message: "Please enter a valid age."
        });
      }
    }

    const collectionCustomer = getCollectionCustomer();
    const [existingEmail, existingContact] = await Promise.all([
      collectionCustomer.findOne({ emailNormalized: email }),
      collectionCustomer.findOne({ contactNormalized })
    ]);

    if (existingEmail && existingContact) {
      return res.status(409).json({
        message: "Email and contact number are already in use."
      });
    }

    if (existingEmail) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    if (existingContact) {
      return res.status(409).json({
        message: "An account with this contact number already exists."
      });
    }

    const now = new Date();
    const result = await collectionCustomer.insertOne({
      name,
      email,
      emailNormalized: email,
      contact,
      contactNormalized,
      age: Number.isInteger(age) ? age : null,
      password: await bcrypt.hash(password, CUSTOMER_BCRYPT_ROUNDS),
      profilePic: "/images/cameraplaceholder.jpg",
      status: "active",
      createdAt: now,
      updatedAt: now
    });

    const created = await collectionCustomer.findOne({ _id: result.insertedId });
    return res.status(201).json({
      message: "Account created successfully.",
      item: serializeCustomer(created)
    });
  } catch (error) {
    if (Number(error?.code) === 11000) {
      const duplicateKey = Object.keys(error?.keyPattern || {})[0] || "";
      if (duplicateKey === "emailNormalized") {
        return res.status(409).json({
          message: "An account with this email already exists."
        });
      }
      if (duplicateKey === "contactNormalized") {
        return res.status(409).json({
          message: "An account with this contact number already exists."
        });
      }
    }

    console.error("Error registering customer:", error);
    return res.status(500).json({
      message: "Failed to create account."
    });
  }
}

async function loginCustomer(req, res) {
  try {
    await initDBIfNecessary();

    const email = normalizeEmail(req.body?.email);
    const password = normalizeText(req.body?.password);

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required."
      });
    }

    const collectionCustomer = getCollectionCustomer();
    const customer = await collectionCustomer.findOne({ emailNormalized: email });

    if (!customer || !customer.password) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    const isMatch = await bcrypt.compare(password, customer.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid email or password."
      });
    }

    if (normalizeText(customer.status).toLowerCase() === "inactive") {
      return res.status(403).json({
        message: "This account is inactive."
      });
    }

    await collectionCustomer.updateOne(
      { _id: customer._id },
      {
        $set: {
          updatedAt: new Date()
        }
      }
    );

    const token = signCustomerToken({
      customerId: customer._id?.toString(),
      email: customer.emailNormalized || customer.email,
      name: customer.name
    });
    setCustomerAuthCookie(res, token);

    return res.status(200).json({
      message: "Login successful.",
      item: serializeCustomer(customer)
    });
  } catch (error) {
    console.error("Error logging in customer:", error);
    return res.status(500).json({
      message: "Failed to login."
    });
  }
}

async function getCurrentCustomer(req, res) {
  try {
    await initDBIfNecessary();

    const customerId = (req.currentCustomer?.customerId || "").toString().trim();
    if (!ObjectId.isValid(customerId)) {
      clearCustomerAuthCookie(res);
      return res.status(401).json({
        message: "Not authenticated."
      });
    }

    const collectionCustomer = getCollectionCustomer();
    const customer = await collectionCustomer.findOne({
      _id: new ObjectId(customerId)
    });

    if (!customer || normalizeText(customer.status).toLowerCase() === "inactive") {
      clearCustomerAuthCookie(res);
      return res.status(401).json({
        message: "Not authenticated."
      });
    }

    return res.status(200).json({
      item: serializeCustomer(customer)
    });
  } catch (error) {
    console.error("Error fetching current customer:", error);
    return res.status(500).json({
      message: "Failed to fetch current customer."
    });
  }
}

async function updateCurrentCustomer(req, res) {
  try {
    await initDBIfNecessary();

    const customerId = (req.currentCustomer?.customerId || "").toString().trim();
    if (!ObjectId.isValid(customerId)) {
      clearCustomerAuthCookie(res);
      return res.status(401).json({
        message: "Not authenticated."
      });
    }

    const name = normalizeText(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const contact = normalizeText(req.body?.contact);
    const contactNormalized = normalizeContact(contact);
    const age = normalizeAge(req.body?.age);
    const changePassword = normalizeText(req.body?.changePassword);
    const confirmPassword = normalizeText(req.body?.confirmPassword);

    if (!name || !email || !contact) {
      return res.status(400).json({
        message: "Name, email, and contact are required."
      });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({
        message: "Please enter a valid email."
      });
    }

    if (!contactNormalized) {
      return res.status(400).json({
        message: "Please enter a valid contact number."
      });
    }

    if (req.body?.age !== undefined && req.body?.age !== null && String(req.body?.age).trim() !== "") {
      if (!Number.isInteger(age) || age < 0 || age > 120) {
        return res.status(400).json({
          message: "Please enter a valid age."
        });
      }
    }

    if (changePassword || confirmPassword) {
      if (!changePassword || !confirmPassword) {
        return res.status(400).json({
          message: "Please fill both password fields."
        });
      }
      if (changePassword !== confirmPassword) {
        return res.status(400).json({
          message: "Passwords do not match."
        });
      }
      if (changePassword.length < 6) {
        return res.status(400).json({
          message: "Password must be at least 6 characters."
        });
      }
    }

    const collectionCustomer = getCollectionCustomer();
    const objectId = new ObjectId(customerId);

    const [existingEmail, existingContact] = await Promise.all([
      collectionCustomer.findOne({
        _id: { $ne: objectId },
        emailNormalized: email
      }),
      collectionCustomer.findOne({
        _id: { $ne: objectId },
        contactNormalized
      })
    ]);

    if (existingEmail) {
      return res.status(409).json({
        message: "An account with this email already exists."
      });
    }

    if (existingContact) {
      return res.status(409).json({
        message: "An account with this contact number already exists."
      });
    }

    const nextSet = {
      name,
      email,
      emailNormalized: email,
      contact,
      contactNormalized,
      age: Number.isInteger(age) ? age : null,
      updatedAt: new Date()
    };

    if (changePassword) {
      nextSet.password = await bcrypt.hash(changePassword, CUSTOMER_BCRYPT_ROUNDS);
    }

    await collectionCustomer.updateOne(
      { _id: objectId },
      {
        $set: nextSet
      }
    );

    const updated = await collectionCustomer.findOne({ _id: objectId });
    if (!updated) {
      clearCustomerAuthCookie(res);
      return res.status(404).json({
        message: "Account not found."
      });
    }

    // Refresh JWT payload if name/email changed.
    const token = signCustomerToken({
      customerId: updated._id?.toString(),
      email: updated.emailNormalized || updated.email,
      name: updated.name
    });
    setCustomerAuthCookie(res, token);

    return res.status(200).json({
      message: "Profile updated successfully.",
      item: serializeCustomer(updated)
    });
  } catch (error) {
    if (Number(error?.code) === 11000) {
      const duplicateKey = Object.keys(error?.keyPattern || {})[0] || "";
      if (duplicateKey === "emailNormalized") {
        return res.status(409).json({
          message: "An account with this email already exists."
        });
      }
      if (duplicateKey === "contactNormalized") {
        return res.status(409).json({
          message: "An account with this contact number already exists."
        });
      }
    }

    console.error("Error updating current customer:", error);
    return res.status(500).json({
      message: "Failed to update profile."
    });
  }
}

async function logoutCustomer(_req, res) {
  clearCustomerAuthCookie(res);
  return res.status(200).json({
    message: "Logged out successfully."
  });
}

async function uploadCurrentCustomerPhoto(req, res) {
  try {
    await initDBIfNecessary();

    const customerId = (req.currentCustomer?.customerId || "").toString().trim();
    if (!ObjectId.isValid(customerId)) {
      clearCustomerAuthCookie(res);
      return res.status(401).json({
        message: "Not authenticated."
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: "Profile photo is required."
      });
    }

    const pictureUrl = `/uploads/${req.file.filename}`;
    const collectionCustomer = getCollectionCustomer();
    const objectId = new ObjectId(customerId);

    await collectionCustomer.updateOne(
      { _id: objectId },
      {
        $set: {
          profilePic: pictureUrl,
          updatedAt: new Date()
        }
      }
    );

    const updated = await collectionCustomer.findOne({ _id: objectId });
    if (!updated) {
      return res.status(404).json({
        message: "Account not found."
      });
    }

    return res.status(200).json({
      message: "Profile photo updated successfully.",
      item: serializeCustomer(updated)
    });
  } catch (error) {
    console.error("Error uploading current customer photo:", error);
    return res.status(500).json({
      message: "Failed to upload profile photo."
    });
  }
}

module.exports = {
  registerCustomer,
  loginCustomer,
  getCurrentCustomer,
  updateCurrentCustomer,
  logoutCustomer,
  uploadCurrentCustomerPhoto
};
