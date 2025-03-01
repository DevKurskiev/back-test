import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from './order.entity';
import { Transaction } from '../transactions/transaction.entity';
import { User } from 'src/users/user.entity';

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  async findAll(
    filters: any,
    currentUser: User,
  ): Promise<{ data: Order[]; total: number }> {
    const query = this.orderRepository
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.seller', 'seller');

    if (filters.currencyPair) {
      query.andWhere('o.currencyPair = :currencyPair', {
        currencyPair: filters.currencyPair,
      });
    }

    if (filters.status) {
      query.andWhere('o.status = :status', { status: filters.status });
    }

    if (filters.sellerId) {
      query.andWhere('seller.id = :sellerId', { sellerId: filters.sellerId });
    }

    if (filters.sortField && filters.sortOrder) {
      query.orderBy(`o.${filters.sortField}`, filters.sortOrder.toUpperCase());
    }

    const page = filters.page ? Number(filters.page) : 1;
    const limit = filters.limit ? Number(filters.limit) : 10;

    query.skip((page - 1) * limit).take(limit);

    const [orders, total] = await query.getManyAndCount();

    if (currentUser.role !== 'admin') {
      return {
        data: orders.map((order) => ({
          ...order,
          seller: order.seller
            ? {
                ...order.seller,
                phone: 'Чу ма хьеж ва аьшк',
                passwordHash: 'укхаза хьаьта а ма хьеж',
              }
            : null,
        })),
        total,
      };
    }

    // Дополнительно добавляем reservedAmount к каждому ордеру
    for (const order of orders) {
      const reservedAmount = await this.getReservedAmount(order.id);
      order['reservedAmount'] = reservedAmount;
    }

    return { data: orders, total };
  }

  async updateOrder(id: number, orderData: Partial<Order>): Promise<Order> {
    const order = await this.orderRepository.findOneBy({ id });
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    let adjustedPrice = +order.price; // 👈 Начинаем с исходной цены

    // Коррекция курса в зависимости от валютной пары и типа операции
    if (order.operationType === 'sell') {
      if (order.currencyPair === 'USD/RUB') {
        adjustedPrice += 0.5; // 👈 Продавец продаёт доллар → +0.5
      } else if (order.currencyPair === 'RUB/USD') {
        adjustedPrice -= 0.5; // 👈 Продавец продаёт рубль → -0.5
      }
    }

    const newOrderData = { ...orderData, price: adjustedPrice };
    const newOrder = { ...order, price: adjustedPrice };

    Object.assign(newOrder, newOrderData);
    return this.orderRepository.save(newOrder);
  }

  async getReservedAmount(orderId: number): Promise<number> {
    const result = await this.transactionRepository
      .createQueryBuilder('transaction')
      .select('SUM(transaction.amount)', 'reservedAmount')
      .where('transaction.order.id = :orderId', { orderId })
      .andWhere('transaction.status IN (:...statuses)', {
        statuses: ['pending'],
      })
      .getRawOne();

    return Number(parseFloat(result.reservedAmount).toFixed(2));
  }

  async recalculateReservedAmount(orderId: number) {
    // Найти все транзакции со статусом "pending" для ордера
    const transactions = await this.transactionRepository.find({
      where: { order: { id: orderId }, status: 'pending' },
    });

    // Пересчитать сумму
    const reservedAmount = transactions.reduce(
      (sum, t) => sum + Number(t.amount),
      0,
    );

    // Обновить ордер
    await this.orderRepository.update(orderId, { reservedAmount });
  }

  async findOne(id: number): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id },
      relations: ['seller'],
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Добавляем поле reservedAmount
    const reservedAmount = await this.getReservedAmount(id);
    order['reservedAmount'] = reservedAmount;

    return order;
  }

  async create(order: Partial<Order>): Promise<Order> {
    let adjustedPrice = order.price; // 👈 Начинаем с исходной цены

    // Коррекция курса в зависимости от валютной пары и типа операции
    if (order.operationType === 'sell') {
      if (order.currencyPair === 'USD/RUB') {
        adjustedPrice += 0.5; // 👈 Продавец продаёт доллар → +0.5
      } else if (order.currencyPair === 'RUB/USD') {
        adjustedPrice -= 0.5; // 👈 Продавец продаёт рубль → -0.5
      }
    }

    const payload = { ...order, price: adjustedPrice };
    const newOrder = this.orderRepository.create(payload);
    return this.orderRepository.save(newOrder);
  }

  async update(id: number, order: Partial<Order>): Promise<Order> {
    await this.orderRepository.update(id, order);
    return this.findOne(id);
  }

  async delete(id: number): Promise<void> {
    const order = await this.findOne(id);

    if (order.reservedAmount > 0) {
      throw new Error('Cannot delete an order with reserved amount');
    }

    await this.orderRepository.delete(id);
  }
}

// $TigerDance99!SkyBlue
