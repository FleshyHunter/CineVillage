import BookingFlowStage from "./BookingFlowStage";
import "./Promotions.css";

export default function Promotions({ screeningId = "" }) {
  return <BookingFlowStage screeningId={screeningId} flowStage="promotions" />;
}
