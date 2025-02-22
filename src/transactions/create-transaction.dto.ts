export class CreateTransactionDto {
  orderId: number;
  amount: number;
  buyerId: number;
  sellerId: number;
  status: string;
  scheduledTime: Date;
}
