import BookingFlowStage from "./BookingFlowStage";
import "./Promotions.css";

export default function Promotions({ screeningId = "", promotionId = "" }) {
  return <BookingFlowStage screeningId={screeningId} flowStage="promotions" promotionId={promotionId} />;
}
