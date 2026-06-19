import { Prisma } from '../generated/client';

type Pagination = {
    total: number;
    totalPages: number;
    pageSize: number;
    page: number;
};
type FindManyAndCountResult<TModel, TArgs> = [Prisma.Result<TModel, TArgs, 'findMany'>, Pagination];

export const findManyAndCountExtension = Prisma.defineExtension((client) => {
    return client
        .$extends({
            name: 'findManyAndCount',
            model: {
                $allModels: {
                    async findManyAndCount<TModel, TArgs extends Prisma.Args<TModel, 'findMany'>>(
                        this: TModel,
                        args?: Prisma.Exact<TArgs, Prisma.Args<TModel, 'findMany'>>
                    ): Promise<FindManyAndCountResult<TModel, TArgs>> {
                        const context = Prisma.getExtensionContext(this);

                        const [records, totalRecords] = await client.$transaction([
                            (context as any).findMany(args),
                            (context as any).count({ where: (args as any)?.where })
                        ]);

                        const take = (args as any)?.take;
                        let totalPages = totalRecords === 0 ? 0 : 1;

                        if (take === 0) {
                            totalPages = 0;
                        } else if (typeof take === 'number') {
                            totalPages = Math.ceil(totalRecords / take);
                        }

                        const pagination: Pagination = {
                            total: totalRecords,
                            totalPages,
                            pageSize: take,
                            page: (args as any)?.skip ? (args as any)?.skip / take + 1 : 1
                        };
                        return [records, pagination] as FindManyAndCountResult<TModel, TArgs>;
                    }
                }
            }
        })
        .$extends({ name: 'q' });
});
