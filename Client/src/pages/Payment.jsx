import BookingFlowStage from "./BookingFlowStage";
import "./Payment.css";

export default function Payment({ screeningId = "" }) {
  return <BookingFlowStage screeningId={screeningId} flowStage="payment" />;
}
