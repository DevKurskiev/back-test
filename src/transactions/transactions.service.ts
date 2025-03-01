import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { Transaction } from './transaction.entity';
import { User } from '../users/user.entity';
import { Order } from '../orders/order.entity';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly dataSource: DataSource,
  ) {}

  async updateStatus(id: number, newStatus: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOneBy({ id });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    transaction.status = newStatus;
    return this.transactionRepository.save(transaction);
  }

  async findAll(filters: any, currentUser: User) {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.buyer', 'buyer')
      .leftJoinAndSelect('transaction.seller', 'seller');
    // Применение фильтров
    if (filters.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: filters.status,
      });
    }
    if (filters.amount) {
      queryBuilder.andWhere('transaction.amount >= :amount', {
        amount: filters.amount,
      });
    }

    // Сортировка
    if (filters.sortField && filters.sortOrder) {
      queryBuilder.orderBy(
        `transaction.${filters.sortField}`,
        filters.sortOrder.toUpperCase(),
      );
    }

    // Пагинация
    const page = filters.page ? Number(filters.page) : 1;
    const limit = filters.limit ? Number(filters.limit) : 10;
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [transactions, total] = await queryBuilder.getManyAndCount();

    // Маскируем поле `phone` для неадминов
    if (currentUser.role !== 'admin') {
      return {
        data: transactions.map((transaction) => ({
          ...transaction,
          buyer: transaction.buyer
            ? {
                ...transaction.buyer,
                phone: 'Чу ма хьеж ва аьшк',
                passwordHash: 'укхаза хьаьта а ма хьеж',
              }
            : null,
          seller: transaction.seller
            ? {
                ...transaction.seller,
                phone: 'Чу ма хьеж ва аьшк',
                passwordHash: 'укхаза хьаьта а ма хьеж',
              }
            : null,
        })),
        total,
      };
    }

    return { data: transactions, total };
  }

  async findByUserId(filters: any, currentUser: User) {
    const queryBuilder = this.transactionRepository
      .createQueryBuilder('transaction')
      .leftJoinAndSelect('transaction.buyer', 'buyer')
      .leftJoinAndSelect('transaction.seller', 'seller')
      .where(
        'transaction.buyerId = :userId OR transaction.sellerId = :userId',
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        { userId: currentUser.userId },
      );

    // Применение фильтров
    if (filters.status) {
      queryBuilder.andWhere('transaction.status = :status', {
        status: filters.status,
      });
    }
    if (filters.amount) {
      queryBuilder.andWhere('transaction.amount >= :amount', {
        amount: filters.amount,
      });
    }

    // Сортировка
    if (filters.sortField && filters.sortOrder) {
      queryBuilder.orderBy(
        `transaction.${filters.sortField}`,
        filters.sortOrder.toUpperCase(),
      );
    }

    // Пагинация
    const page = filters.page ? Number(filters.page) : 1;
    const limit = filters.limit ? Number(filters.limit) : 10;
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [transactions, total] = await queryBuilder.getManyAndCount();

    return {
      data: transactions.map((transaction) => ({
        ...transaction,
        buyer: transaction.buyer
          ? { ...transaction.buyer, phone: undefined, passwordHash: undefined }
          : null,
        seller: transaction.seller
          ? { ...transaction.seller, phone: undefined, passwordHash: undefined }
          : null,
      })),
      total,
    };
  }

  async findOne(id: number): Promise<Transaction> {
    return this.transactionRepository.findOne({
      where: { id },
      relations: ['buyer', 'order', 'order.seller'],
    });
  }

  async create(data: any) {
    const { buyerId, sellerId, orderId, amount, ...rest } = data;

    const queryRunner: QueryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Выполняем атомарное обновление с проверкой доступной суммы
      const updateResult = await queryRunner.manager.query(
        `UPDATE "orders"
          SET "reservedAmount" = "reservedAmount" + $1
          WHERE "id" = $2 AND ("amount" - "reservedAmount") >= $1
          RETURNING *`,
        [amount, orderId],
      );

      // Проверяем результат обновления
      if (!updateResult || !updateResult[0] || !updateResult[0][0]) {
        const currentOrder = await queryRunner.manager.findOne(Order, {
          where: { id: orderId },
        });

        if (!currentOrder) {
          throw new NotFoundException('Order not found');
        }

        const availableAmount =
          currentOrder.amount - currentOrder.reservedAmount;

        // Определяем валютную пару и название валюты
        let currencyLabel = '';
        switch (currentOrder.currencyPair) {
          case 'USD/RUB':
            currencyLabel = 'рублей';
            break;
          case 'RUB/USD':
            currencyLabel = 'долларов';
            break;
          default:
            currencyLabel = 'единиц'; // Значение по умолчанию для других валютных пар
        }

        throw new ConflictException(
          `Сумма заказа изменилась. Доступно только: ${availableAmount} ${currencyLabel}.`,
        );
      }

      const updatedOrder = updateResult[0][0];

      // Создаем транзакцию
      const transaction = this.transactionRepository.create({
        buyer: await queryRunner.manager.findOne(User, {
          where: { id: buyerId },
        }),
        seller: await queryRunner.manager.findOne(User, {
          where: { id: sellerId },
        }),
        order: updatedOrder,
        amount,
        ...rest,
      });

      await queryRunner.manager.save(transaction);

      await queryRunner.commitTransaction();
      return transaction;
    } catch (error) {
      if (error instanceof ConflictException) {
        // Возвращаем понятное сообщение для клиента
        throw error;
      }

      // Другие ошибки (например, технические проблемы)
      await queryRunner.rollbackTransaction();
      throw new InternalServerErrorException(
        'An error occurred while processing the transaction.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  async getTransactionWithMaskedData(transactionId: number, currentUser: User) {
    const transaction = await this.transactionRepository.findOne({
      where: { id: transactionId },
      relations: ['buyer', 'seller'],
      select: {
        id: true,
        amount: true,
        status: true,
        buyer: {
          id: true,
          username: true,
          phone: currentUser.role === 'admin',
        },
        seller: {
          id: true,
          username: true,
          phone: currentUser.role === 'admin',
        },
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return transaction;
  }

  async confirmTransaction(id: number): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['order'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    transaction.status = 'done';

    // Уменьшаем сумму в ордере
    const order = transaction.order;
    order.amount -= transaction.amount;
    order.reservedAmount -= transaction.amount;

    await this.orderRepository.save(order);
    return this.transactionRepository.save(transaction);
  }

  async cancelTransaction(id: number, user: any) {
    // Найти транзакцию по ID
    const transaction = await this.transactionRepository.findOne({
      where: { id },
      relations: ['buyer', 'seller', 'order'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    // Проверить, что пользователь связан с транзакцией как покупатель или продавец
    if (
      transaction.buyer.id !== user.userId &&
      transaction.seller.id !== user.userId
    ) {
      throw new UnauthorizedException(
        'You do not have permission to cancel this transaction',
      );
    }

    // Обновить статус транзакции на "canceled"
    transaction.status = 'canceled';
    await this.transactionRepository.save(transaction);

    // Пересчитать зарезервированную сумму для ордера
    await this.ordersService.recalculateReservedAmount(transaction.order.id);

    return { message: 'Transaction canceled successfully' };
  }

  async update(
    id: number,
    transactionData: Partial<Transaction>,
  ): Promise<Transaction> {
    await this.transactionRepository.update(id, transactionData);
    return this.findOne(id);
  }

  async delete(id: number): Promise<void> {
    await this.transactionRepository.delete(id);
  }
}
