import BookingFlowStage from "./BookingFlowStage";
import "./AddOns.css";

export default function AddOns({ screeningId = "" }) {
  return <BookingFlowStage screeningId={screeningId} flowStage="addons" />;
}
