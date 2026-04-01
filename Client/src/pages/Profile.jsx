import { useEffect, useMemo, useRef, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { useAccount } from "../context/AccountContext";
import { resolveMoviePictureUrl } from "../services/api";
import "./EditProfile.css";
import "./Profile.css";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Profile() {
  const { user, updateCustomerProfile, updateCustomerPhoto } = useAccount();
  const [mode, setMode] = useState("view");
  const [form, setForm] = useState({
    name: (user?.name || "").toString(),
    email: (user?.email || "").toString(),
    contact: (user?.contact || "").toString(),
    changePassword: "",
    confirmPassword: ""
  });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);
  const profilePicUrl = resolveMoviePictureUrl(user?.profilePic || "");
  const isEditMode = mode === "edit";

  useEffect(() => {
    setForm((previous) => ({
      ...previous,
      name: (user?.name || "").toString(),
      email: (user?.email || "").toString(),
      contact: (user?.contact || "").toString()
    }));
  }, [user?.contact, user?.email, user?.name]);

  const isFormChanged = useMemo(() => {
    return form.name !== (user?.name || "")
      || form.email !== (user?.email || "")
      || form.contact !== (user?.contact || "")
      || form.changePassword.length > 0
      || form.confirmPassword.length > 0;
  }, [form, user?.contact, user?.email, user?.name]);

  function handleChange(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value
    }));
    setErrors((previous) => ({
      ...previous,
      [field]: ""
    }));
    setMessage("");
  }

  function validate() {
    const nextErrors = {};
    const name = form.name.trim();
    const email = form.email.trim();
    const contact = form.contact.trim();
    const changePassword = form.changePassword.trim();
    const confirmPassword = form.confirmPassword.trim();

    if (!name) nextErrors.name = "Name is required.";
    if (!email || !EMAIL_PATTERN.test(email)) nextErrors.email = "Valid email is required.";
    if (!contact) nextErrors.contact = "Contact number is required.";
    if (changePassword || confirmPassword) {
      if (!changePassword || !confirmPassword) {
        nextErrors.confirmPassword = "Please fill both password fields.";
      } else if (changePassword !== confirmPassword) {
        nextErrors.confirmPassword = "Passwords do not match.";
      } else if (changePassword.length < 6) {
        nextErrors.changePassword = "Password must be at least 6 characters.";
      }
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function enterEditMode() {
    setMode("edit");
    setErrors({});
    setMessage("");
    setForm({
      name: (user?.name || "").toString(),
      email: (user?.email || "").toString(),
      contact: (user?.contact || "").toString(),
      changePassword: "",
      confirmPassword: ""
    });
  }

  function cancelEditMode() {
    setMode("view");
    setErrors({});
    setMessage("");
    setForm({
      name: (user?.name || "").toString(),
      email: (user?.email || "").toString(),
      contact: (user?.contact || "").toString(),
      changePassword: "",
      confirmPassword: ""
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!isEditMode) return;
    if (!validate()) return;

    try {
      setIsSaving(true);
      setMessage("");
      await updateCustomerProfile({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        contact: form.contact.trim(),
        changePassword: form.changePassword.trim(),
        confirmPassword: form.confirmPassword.trim()
      });
      setMode("view");
      setMessage("Profile updated.");
      setForm((previous) => ({
        ...previous,
        changePassword: "",
        confirmPassword: ""
      }));
    } catch (saveError) {
      setMessage(saveError?.message || "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSelectProfilePhoto(event) {
    const file = event.target?.files?.[0];
    event.target.value = "";
    if (!file || !isEditMode) return;

    try {
      setIsUploadingPhoto(true);
      setMessage("");
      await updateCustomerPhoto(file);
      setMessage("Profile photo updated.");
    } catch (uploadError) {
      setMessage(uploadError?.message || "Failed to upload profile photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  return (
    <section className="edit-profile-page profile-inline-page">
      <form className="edit-profile-card profile-inline-card" onSubmit={handleSubmit}>
        <h2>{isEditMode ? "Edit Profile" : "Profile"}</h2>

        <div className="profile-inline-photo">
          <span className="edit-profile-photo-label">Profile Photo</span>
          <button
            type="button"
            className={`profile-inline-avatar-button${isEditMode ? " is-editable" : ""}`}
            onClick={() => {
              if (!isEditMode || isUploadingPhoto) return;
              photoInputRef.current?.click();
            }}
            disabled={!isEditMode || isUploadingPhoto}
            aria-label={isEditMode ? "Upload profile photo" : "Profile photo"}
          >
            <img src={profilePicUrl} alt="Profile" className="profile-inline-avatar" />
            {isEditMode ? (
              <span className="profile-inline-avatar-hint">
                {isUploadingPhoto ? "Uploading..." : "Click to upload"}
              </span>
            ) : null}
          </button>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="profile-inline-avatar-input"
            onChange={handleSelectProfilePhoto}
          />
        </div>

        <label className="edit-profile-field">
          <span>Name</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => handleChange("name", event.target.value)}
            placeholder="Enter name"
            readOnly={!isEditMode}
          />
          {errors.name ? <small>{errors.name}</small> : null}
        </label>

        <label className="edit-profile-field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(event) => handleChange("email", event.target.value)}
            placeholder="Enter email"
            readOnly={!isEditMode}
          />
          {errors.email ? <small>{errors.email}</small> : null}
        </label>

        <label className="edit-profile-field">
          <span>Contact Number</span>
          <input
            type="text"
            value={form.contact}
            onChange={(event) => handleChange("contact", event.target.value)}
            placeholder="Enter contact number"
            readOnly={!isEditMode}
          />
          {errors.contact ? <small>{errors.contact}</small> : null}
        </label>

        {isEditMode ? (
          <div className="edit-profile-password-row">
            <label className="edit-profile-field">
              <span>Change Password</span>
              <input
                type="password"
                value={form.changePassword}
                onChange={(event) => handleChange("changePassword", event.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
              {errors.changePassword ? <small>{errors.changePassword}</small> : null}
            </label>

            <label className="edit-profile-field">
              <span>Confirm Password</span>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(event) => handleChange("confirmPassword", event.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
              {errors.confirmPassword ? <small>{errors.confirmPassword}</small> : null}
            </label>
          </div>
        ) : null}

        {message ? <p className="edit-profile-message">{message}</p> : null}

        <div className="edit-profile-actions profile-inline-actions">
          {isEditMode ? (
            <>
              <SeatSelectionButton variant="secondary" onClick={cancelEditMode}>
                CANCEL
              </SeatSelectionButton>
              <SeatSelectionButton type="submit" variant="primary" disabled={!isFormChanged || isSaving}>
                {isSaving ? "SAVING..." : "SAVE"}
              </SeatSelectionButton>
            </>
          ) : (
            <>
              <SeatSelectionButton variant="secondary" onClick={() => { window.location.hash = "#"; }}>
                BACK TO HOME
              </SeatSelectionButton>
              <SeatSelectionButton variant="secondary" onClick={() => { window.location.hash = "#my-tickets"; }}>
                VIEW MY TICKETS
              </SeatSelectionButton>
              <SeatSelectionButton variant="primary" onClick={enterEditMode}>
                EDIT PROFILE
              </SeatSelectionButton>
            </>
          )}
        </div>
      </form>
    </section>
  );
}
