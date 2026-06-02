export interface IDomainEvent {
  occurredAt: Date;
  companyId: string;
  eventName: string;
  payload: any;
}

export class LoanBorrowedEvent implements IDomainEvent {
  public occurredAt = new Date();
  public eventName = 'finance:loan_borrowed';
  
  constructor(
    public companyId: string,
    public payload: {
      amount: number;
      activeDebtPrincipal: number;
      activeDebtInterest: number;
      message: string;
    }
  ) {}
}

export class RouteDispatchedEvent implements IDomainEvent {
  public occurredAt = new Date();
  public eventName = 'route:dispatched';

  constructor(
    public companyId: string,
    public payload: {
      routeId: string;
      truckId: string;
      driverName: string;
      origin: string;
      destination: string;
      message: string;
    }
  ) {}
}

export class GenericDomainEvent implements IDomainEvent {
  public occurredAt = new Date();

  constructor(
    public companyId: string,
    public eventName: string,
    public payload: any
  ) {}
}
